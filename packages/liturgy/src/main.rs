use std::io::{self, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    match std::env::args().nth(1).as_deref() {
        Some("index") => {
            if std::env::args().nth(2).is_some() {
                usage();
                return ExitCode::from(2);
            }
            let repo = match repo_root() {
                Some(path) => path,
                None => {
                    eprintln!("liturgy: cannot find the repository root");
                    return ExitCode::from(1);
                }
            };
            match liturgy::index_bytes(&repo) {
                Ok(bytes) => {
                    let mut out = io::stdout().lock();
                    if out.write_all(&bytes).is_err() {
                        return ExitCode::from(1);
                    }
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!("liturgy: {error}");
                    ExitCode::from(1)
                }
            }
        }
        _ => {
            usage();
            ExitCode::from(2)
        }
    }
}

fn usage() {
    eprintln!("usage: liturgy index");
}

fn repo_root() -> Option<std::path::PathBuf> {
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()?
        .parent()
        .map(std::path::Path::to_path_buf)
}
