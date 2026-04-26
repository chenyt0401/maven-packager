use crate::error::{to_user_error, AppResult};
use crate::repositories::deployment_repo::ExecutionServerProfile;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use encoding_rs::GBK;
use std::fs::File;
use std::io::Read;
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

pub struct CommandResult {
    pub output: String,
    pub exit_status: i32,
}

/// A reusable SSH connection that avoids creating new TCP+handshake+auth for each command.
/// Uses `ssh-rs`, a pure Rust SSH implementation that supports modern algorithms like curve25519-sha256.
pub struct SshConnection {
    session: ssh::LocalSession<TcpStream>,
}

impl SshConnection {
    /// Opens an SSH connection once (password or private_key), reusable for all subsequent operations.
    /// `is_cancelled` is checked before blocking operations to support early stop.
    pub fn connect<C>(profile: &ExecutionServerProfile, mut is_cancelled: C) -> AppResult<Self>
    where
        C: FnMut() -> bool,
    {
        if is_cancelled() {
            return Err(to_user_error("部署已停止。"));
        }
        let session = match profile.auth_type.as_str() {
            "password" => {
                if profile.password.as_deref().is_none_or(|value| value.trim().is_empty()) {
                    return Err(to_user_error("服务器密码不存在。"));
                }
                open_password_session(profile, &mut is_cancelled)?
            }
            "private_key" => {
                let key_path = profile
                    .private_key_path
                    .as_deref()
                    .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?;
                if !Path::new(key_path).exists() {
                    return Err(to_user_error("私钥文件不存在。"));
                }
                open_private_key_session(profile, &mut is_cancelled)?
            }
            _ => return Err(to_user_error("暂不支持的认证方式。")),
        };
        Ok(Self { session })
    }

    /// Execute a remote command with cancellation support.
    pub fn execute_with_cancel<C>(
        &mut self,
        command: &str,
        mut is_cancelled: C,
    ) -> AppResult<CommandResult>
    where
        C: FnMut() -> bool,
    {
        self.execute_allowing_status(command, &[], &mut is_cancelled)
    }

    /// Execute a remote command and treat the provided exit codes as successful.
    pub fn execute_allowing_status<C>(
        &mut self,
        command: &str,
        success_exit_codes: &[i32],
        mut is_cancelled: C,
    ) -> AppResult<CommandResult>
    where
        C: FnMut() -> bool,
    {
        if is_cancelled() {
            return Err(to_user_error("部署已停止。"));
        }

        // ssh-rs exec channel can only execute one command and then be consumed.
        // We need to open a new channel for each command.
        let mut channel = self
            .session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;

        channel
            .exec_command(command)
            .map_err(|error| to_user_error(format!("远端命令执行失败：{}", error)))?;

        let stdout = channel
            .get_output()
            .map_err(|error| to_user_error(format!("读取命令输出失败：{}", error)))?;

        let exit_status = channel
            .exit_status()
            .map_err(|error| to_user_error(format!("读取远端命令退出码失败：{}", error)))? as i32;

        // ssh-rs doesn't provide separate stderr in the simple API.
        // We treat all output as combined stdout+stderr.
        parse_command_bytes(stdout, Vec::new(), exit_status, success_exit_codes, "远端命令执行失败")
    }

    /// Upload a file via SCP with progress reporting and cancellation support.
    pub fn upload_file_with_progress<C, P>(
        &mut self,
        local_path: &Path,
        remote_path: &str,
        mut is_cancelled: C,
        mut on_progress: P,
    ) -> AppResult<()>
    where
        C: FnMut() -> bool,
        P: FnMut(u64, u64),
    {
        if !local_path.exists() {
            return Err(to_user_error("本地产物不存在。"));
        }

        let mut local_file = File::open(local_path)
            .map_err(|error| to_user_error(format!("无法打开本地产物：{}", error)))?;
        let file_size = local_file
            .metadata()
            .map_err(|error| to_user_error(format!("无法读取本地产物信息：{}", error)))?
            .len();

        // Use shell channel with scp command for file upload
        // This is a workaround since ssh-rs LocalShell doesn't have a direct scp upload API
        let remote_dir = Path::new(remote_path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "/tmp".to_string());

        // Ensure remote directory exists
        let mkdir_cmd = format!("mkdir -p {}", remote_dir);
        let mut mkdir_channel = self
            .session
            .open_exec()
            .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
        mkdir_channel
            .exec_command(&mkdir_cmd)
            .map_err(|error| to_user_error(format!("创建远端目录失败：{}", error)))?;
        let _ = mkdir_channel.get_output();

        // Read local file into memory and use base64 encoding + dd command for upload
        // This avoids dependency on external scp binary
        let mut buffer = Vec::new();
        local_file
            .read_to_end(&mut buffer)
            .map_err(|error| to_user_error(format!("读取本地产物失败：{}", error)))?;

        let encoded = BASE64.encode(&buffer);
        let chunk_size = 8192;

        // Write base64 chunks to remote file and decode
        let temp_b64 = format!("{}/.upload.b64", remote_dir);

        // For large files, split into smaller commands
        if encoded.len() > 100 * 1024 {
            // Use chunked upload for large files
            let mut upload_channel = self
                .session
                .open_exec()
                .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;

            // Clear temp file
            let clear_cmd = format!("> {}", temp_b64);
            upload_channel.exec_command(&clear_cmd).ok();
            let _ = upload_channel.get_output();

            for (i, chunk) in encoded.as_bytes().chunks(chunk_size).enumerate() {
                if is_cancelled() {
                    return Err(to_user_error("部署已停止。"));
                }

                let chunk_str = String::from_utf8_lossy(chunk);
                let append_cmd = format!("echo -n '{}' >> {}", chunk_str, temp_b64);

                let mut chunk_channel = self
                    .session
                    .open_exec()
                    .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
                chunk_channel
                    .exec_command(&append_cmd)
                    .map_err(|error| to_user_error(format!("上传文件块失败：{}", error)))?;
                let _ = chunk_channel.get_output();

                on_progress(((i + 1) as u64 * chunk_size as u64).min(file_size), file_size);
            }

            // Decode base64 to final file
            let mut decode_channel = self
                .session
                .open_exec()
                .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
            let decode_cmd = format!("base64 -d {} > {} && rm -f {}", temp_b64, remote_path, temp_b64);
            decode_channel
                .exec_command(&decode_cmd)
                .map_err(|error| to_user_error(format!("解码上传文件失败：{}", error)))?;
            let _ = decode_channel.get_output();
        } else {
            let write_cmd = format!(
                "echo '{}' > {} && base64 -d {} > {} && rm -f {}",
                encoded, temp_b64, temp_b64, remote_path, temp_b64
            );
            let mut upload_channel = self
                .session
                .open_exec()
                .map_err(|error| to_user_error(format!("无法打开 SSH 命令通道：{}", error)))?;
            upload_channel
                .exec_command(&write_cmd)
                .map_err(|error| to_user_error(format!("上传产物失败：{}", error)))?;
            let _ = upload_channel.get_output();
            on_progress(file_size, file_size);
        }

        Ok(())
    }
}

// --- Internal helpers ---

const CONNECT_TIMEOUT_SECONDS: u64 = 10;

fn open_password_session<C>(profile: &ExecutionServerProfile, mut is_cancelled: C) -> AppResult<ssh::LocalSession<TcpStream>>
where
    C: FnMut() -> bool,
{
    let password = profile
        .password
        .as_deref()
        .ok_or_else(|| to_user_error("服务器密码不存在。"))?;

    if is_cancelled() {
        return Err(to_user_error("部署已停止。"));
    }

    let connector = ssh::create_session()
        .username(&profile.username)
        .password(password)
        .connect_with_timeout(
            (&profile.host as &str, profile.port),
            Some(Duration::from_secs(CONNECT_TIMEOUT_SECONDS)),
        )
        .map_err(|error| to_user_error(format!("SSH 连接失败：{}", error)))?;

    let session = connector
        .run_local();

    Ok(session)
}

fn open_private_key_session<C>(profile: &ExecutionServerProfile, mut is_cancelled: C) -> AppResult<ssh::LocalSession<TcpStream>>
where
    C: FnMut() -> bool,
{
    let key_path = profile
        .private_key_path
        .as_deref()
        .ok_or_else(|| to_user_error("私钥认证需要提供私钥路径。"))?;

    if is_cancelled() {
        return Err(to_user_error("部署已停止。"));
    }

    let connector = ssh::create_session()
        .username(&profile.username)
        .private_key_path(key_path)
        .connect_with_timeout(
            (&profile.host as &str, profile.port),
            Some(Duration::from_secs(CONNECT_TIMEOUT_SECONDS)),
        )
        .map_err(|error| to_user_error(format!("SSH 连接失败：{}", error)))?;

    let session = connector
        .run_local();

    Ok(session)
}

fn parse_command_bytes(
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    exit_status: i32,
    success_exit_codes: &[i32],
    fallback: &str,
) -> AppResult<CommandResult> {
    let combined = format!("{}{}", decode_output(&stdout), decode_output(&stderr))
        .trim()
        .to_string();
    let success_codes = if success_exit_codes.is_empty() {
        &[0][..]
    } else {
        success_exit_codes
    };
    if !success_codes.contains(&exit_status) {
        return Err(to_user_error(if combined.is_empty() {
            fallback.to_string()
        } else {
            combined
        }));
    }
    Ok(CommandResult {
        output: combined,
        exit_status,
    })
}

fn decode_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    String::from_utf8(bytes.to_vec()).unwrap_or_else(|_| {
        let (value, _, _) = GBK.decode(bytes);
        value.into_owned()
    })
}
