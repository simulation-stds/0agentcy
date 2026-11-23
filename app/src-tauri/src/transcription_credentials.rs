//! Hugging Face credentials stay in the OS credential store or this process only.
use std::sync::Mutex;

const SERVICE: &str = "Videomaxxing.WhisperX";
const ACCOUNT: &str = "hugging-face";
struct Credentials {
    loaded: bool,
    token: Option<String>,
    persistent: bool,
}
static CREDENTIALS: Mutex<Credentials> = Mutex::new(Credentials {
    loaded: false,
    token: None,
    persistent: false,
});

fn entry() -> Result<keyring::Entry, String> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        let service = if std::env::var_os("VIDEOMAXXING_STAGING_PROFILE").is_some() {
            "Videomaxxing.Staging.WhisperX"
        } else {
            SERVICE
        };
        keyring::Entry::new(service, ACCOUNT)
            .map_err(|_| "Could not open the system credential store.".into())
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("Remembered tokens are supported on Windows and Linux. Use a token for this session only.".into())
    }
}

fn storage_error() -> String {
    "Secure credential storage is unavailable or locked. Unlock your system keyring, or use a token for this session only.".into()
}
pub fn read() -> Result<(Option<String>, bool), String> {
    let mut state = CREDENTIALS
        .lock()
        .map_err(|_| "Credential storage is busy.")?;
    if !state.loaded {
        match entry()?.get_password() {
            Ok(token) => {
                state.token = Some(token);
                state.persistent = true;
            }
            Err(keyring::Error::NoEntry) => {
                state.token = None;
                state.persistent = false;
            }
            Err(_) => return Err(storage_error()),
        }
        state.loaded = true;
    }
    Ok((state.token.clone(), state.persistent))
}
pub fn store(token: String, remember: bool) -> Result<(), String> {
    let token = token.trim();
    if !token.starts_with("hf_")
        || token.len() < 10
        || token.len() > 512
        || token.chars().any(char::is_whitespace)
    {
        return Err("Enter a Hugging Face access token beginning with hf_.".into());
    }
    let mut state = CREDENTIALS
        .lock()
        .map_err(|_| "Credential storage is busy.")?;
    if remember {
        entry()?.set_password(token).map_err(|_| storage_error())?;
    } else if state.persistent {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => return Err(storage_error()),
        }
    }
    state.token = Some(token.to_owned());
    state.persistent = remember;
    state.loaded = true;
    Ok(())
}
pub fn clear() -> Result<(), String> {
    let mut state = CREDENTIALS
        .lock()
        .map_err(|_| "Credential storage is busy.")?;
    // Never claim a remembered token was removed if the system keyring could not be reached.
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => (),
        Err(_) if state.loaded && !state.persistent => (),
        Err(_) => return Err(storage_error()),
    }
    state.token = None;
    state.persistent = false;
    state.loaded = true;
    Ok(())
}
