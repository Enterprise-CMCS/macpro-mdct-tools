# macpro-mdct-tools

mdct-tools is a CMCS MDCT repo for code-based tooling and scripts used by the MDCT application development team.

## Workspace setup

The MDCT program uses the workspace setup script to maintain a consistent approach to development tooling and directory structure of the MDCT products. The script helps new developers onboard to the program and helps existing developers install the latest tooling and reset local dependencies for each repository.

### Running Workspace setup

#### Pre-requisites

There are no pre-requisites to running the script other than a Mac and a terminal.

#### New Developers

If you're new to the MDCT program and have not cloned any repositories yet please follow the steps below

1. Open your terminal
2. Go to your home directory by running `cd ~/`
3. In your home directory paste and run the following command

`curl -o mdct-setup.sh https://raw.githubusercontent.com/Enterprise-CMCS/macpro-mdct-tools/main/mdct-setup.sh && chmod +x mdct-setup.sh && ./mdct-setup.sh`

#### Existing Developers

If you're a developer on the MDCT program and need to re-run the workspace setup script follow these steps

1. `cd ~/Projects/macpro-mdct-tools`
2. `git checkout main`
3. `git pull`
4. `sh mdct-setup.sh`

### What does workspace setup do?

1. The MDCT workspace setup script starts by removing any existing applicable installations that may have been installed by hand or possibly through other projects on your workstation. These include installations of serverless, java, npm, and nvm.
2. You then choose your preferred shell between ZSH or BASH. This will be used to write certain variables and PATHS throughout the script
3. A `~/Projects` directory is created if it does not already exist. This will be the base directory where all MDCT repositories are cloned.
4. Brew and XCode Command Line tools are installed if they have not already been installed.
5. Standard tooling is installed using brew. Tools include pre-commit, nvm, kion, java, etc.
6. Repositories are cloned to the `~/Projects` folder
7. The script then loops through each repository and does the following
   - Checks to see if the repository is on the main branch
   - Runs `pre-commit install` to ensure latest pre-commit hooks are installed and up to date
   - Pulls the latest changes from the integration branch
   - Installs the correct version of node if it's not installed by referencing the .nvmrc
   - Removes all of the services node_module directories and runs yarn to pull in or refresh dependencies for each repository. If you're running for the first time, it just adds them.

### Things to note:

- **This script is meant solely to be run on Mac OS**. Currently Windows and Linux OS are not supported and have not been tested.
- The script will error out early if you are not on the correct integration branch for **any** repository. You must check out main in all of the repositories to run the script
- The script clones all of the repos using HTTPS and not SSH. If you prefer to use ssh for github authentication you can run the following after you've run the workspace setup script. Also, this is a one time command and will not need to be run after future runs of the workspace setup script.

`cd ~/Projects/macpro-mdct-carts && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-carts.git &&
cd ~/Projects/macpro-mdct-core && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-core.git &&
cd ~/Projects/macpro-mdct-hcbs && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-hcbs.git &&
cd ~/Projects/macpro-mdct-mcr && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-mcr.git &&
cd ~/Projects/macpro-mdct-mfp && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-mfp.git &&
cd ~/Projects/macpro-mdct-qmr && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-qmr.git &&
cd ~/Projects/macpro-mdct-rhtp && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-rhtp.git &&
cd ~/Projects/macpro-mdct-seds && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-seds.git &&
cd ~/Projects/macpro-mdct-tools && git remote set-url origin git@github.com:Enterprise-CMCS/macpro-mdct-tools.git`

### Tools Installed:

Tools installed via script:

```
brew
XCode Command Line Tools
```

Tools installed via brew:

```
aws cli
jq
nvm
pre-commit
java
aws logs
git
github cli
1password cli
snyk cli
kion
docker
colima
localstack
```

Tools installed via npm:

```
dynamodb-admin
```

### Developing/Adding Changes to Workspace setup:

The team is encouraged to add changes to the workspace setup that will be beneficial to the entire team. To make changes the current process is as following:

1. `cd ~/Projects/macpro-mdct-tools`
2. create a new branch and push it to remote
3. make any changes to the mdct-setup.sh script
4. commit and push those changes to the remote
5. `rm ~/mdct-setup.sh` (if it already exists)
6. `cp ~/Projects/macpro-mdct-tools/mdct-setup.sh ~/`
7. `git checkout main`
8. `cd ~/`
9. `sh mdct-setup.sh`

note: These are the steps at the time of publishing and may be changed later for a more seamless development workflow.

### 1Password:

- The setup script installs the 1Password CLI. You will need a 1Password account to retrieve secrets when running the MDCT applications or you will need to reach out to the team for examples to be manually populated if you do not have a 1Password account or cannot get one.

- If using 1Password it's highly recommended to install the 1Password desktop application. When the `./run local --update-env` or `./run update-env` commands are run 1Password CLI needs to authenticate to pull the credentials, the desktop app makes this a more seamless process by allowing you to authenticate via fingerprint on your Mac.

### Kion

Kion CLI is a tool installed by workspace setup that allows you to obtain temporary access keys or console access after you've been granted the approparite job codes.

To use Kion you will need to be logged into CMS VPN via Zscaler

For console access run the following from anywhere in your terminal

`kion c`

For temporary access keys run the following from anywhere in your terminal

`kion s`

Both steps above will prompt you for your EUA password then walk you through a select menu in which you select your desired account you wish to gain access whether it be for temporary access keys or console access.
