use std::io;
use std::process::{Command, Output};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn git_command_base(repo_path: &str) -> Command {
    let mut command = Command::new("git");
    command.arg("-C").arg(repo_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

pub fn run_git(repo_path: &str, args: &[&str]) -> Result<Output, io::Error> {
    let mut command = git_command_base(repo_path);
    command.args(args).output()
}

pub fn run_git_owned(repo_path: &str, args: &[String]) -> Result<Output, io::Error> {
    let mut command = git_command_base(repo_path);
    command.args(args).output()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_git_returns_stdout_for_successful_command() {
        let output = run_git(".", &["--version"]).expect("run git --version");
        assert!(output.status.success());
        assert!(!String::from_utf8_lossy(&output.stdout).trim().is_empty());
    }

    #[test]
    fn run_git_preserves_failure_status_and_stderr() {
        let output =
            run_git(".", &["definitely-not-a-git-subcommand"]).expect("run git invalid command");
        assert!(!output.status.success());
        assert!(!String::from_utf8_lossy(&output.stderr).trim().is_empty());
    }
}
