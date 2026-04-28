set -e

# Define the clone directory
clone_dir="$HOME/Projects"

# Define the URLs of the MDCT repositories
repo_urls=(
    "https://github.com/Enterprise-CMCS/macpro-mdct-carts.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-hcbs.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-mcr.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-mfp.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-pasrr.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-qmr.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-rhtp.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-seds.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-core.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-tools.git"
)

# Check that user is using MacOS
echo "checking os type"
if [[ ! "$OSTYPE" =~ ^darwin ]]; then
  echo "ERROR:  This script is intended only for MacOS." && exit 1
fi

# Loop through each repository URL
echo "Checking to see if the MDCT repos already exist and ensure they are on the correct branch to continue running the MDCT workspace setup script...."
for repo_url in "${repo_urls[@]}"; do
    # Extract the repository name from the URL
    repo_name=$(basename -s .git "$repo_url")

    # Construct the repository directory path
    repo_dir="$clone_dir/$repo_name"

    # Check if the repository directory exists
    if [ -d "$repo_dir" ]; then
        # Change to the repository directory
        cd "$repo_dir" || exit 1

        # Check if the directory is a Git repository
        if [ -d ".git" ]; then
            # Get the current branch name
            current_branch=$(git rev-parse --abbrev-ref HEAD)

            # Check if the current branch is 'main'
            if [[ "$current_branch" != "main" ]]; then
                echo "Repository $repo_name is not on the 'main'. Please commit any changes you may have and checkout main to re-run the MDCT workspace setup script."
                exit 1
            fi
        else
            echo "Directory $repo_dir is not a Git repository."
        fi
    else
        echo "Repository $repo_name does not exist in $clone_dir."
    fi
done

confirm() {
    if [ "$CI" = "true" ]; then
        return 0
    fi

    read -r -p "${1:-Are you sure? [Y/n]} " response
    case "$response" in
        [yY][eE][sS]|[yY]|"")
            true
            ;;
        *)
            false
            ;;
    esac
}

# Confirmation prompt
if ! confirm "Warning: This script will remove all node modules and re-download. Would you like to continue? [Y/n]"; then
    echo "Exiting script."
    exit 0
fi

shell=""
shellprofile=""
mdctrcfile=""

if [ "$CI" != "true" ]; then
  echo "Which terminal shell do you want to configure?  Please input a number and hit Enter:"
  select selectedshell in zsh bash
  do
    case $selectedshell in
      "zsh")
        shell=$selectedshell
        shellprofile="$HOME/.zprofile"
        mdctrcfile="$HOME/.mdctrc"
        ;;

      "bash")
        shell=$selectedshell
        mdctrcfile="$HOME/.mdctrc"
        if test -f "$HOME/.bash_profile"; then
          shellprofile="$HOME/.bash_profile"
        else
          shellprofile="$HOME/.bashrc"
        fi
        ;;
      *)
        echo "ERROR:  Invalid input.  Exiting."
        exit 1
        ;;
    esac
    break
  done
else
  shell="bash"
  shellprofile="/tmp/.profile"
  mdctrcfile="/tmp/.mdctrc"
fi

touch $mdctrcfile
touch $shellprofile
if ! grep -q "source $mdctrcfile" $shellprofile; then
  (echo; echo "source $mdctrcfile") >> $shellprofile
fi

# Install HomeBrew, an OSX package manager
echo "checking to see if brew is installed"
if ! which brew > /dev/null ; then
  echo "installing brew"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Set some things based on chip architecture
arch=`uname -m`
homebrewprefix=""
if [ "$arch" = "arm64" ]; then
  # If we're on Apple Silicon, check that Rosetta 2 has already been installed and is running.
  if ! /usr/bin/arch -x86_64 /usr/bin/true 2>/dev/null; then
    echo "ERROR:  Rosetta must be installed on this machine before running this script, but was not found." && exit 1
  fi
  echo "homebrew prefix is /opt/homebrew"
  homebrewprefix="/opt/homebrew"
else
  echo "homebrewprefix is /usr/local"
  homebrewprefix="/usr/local"
fi

if ! grep -q '$('$homebrewprefix'/bin/brew shellenv)"' $shellprofile; then
  (echo; echo 'eval "$('$homebrewprefix'/bin/brew shellenv)"') >> $shellprofile
fi
eval "$($homebrewprefix/bin/brew shellenv)"

# Create the Projects directory if it doesn't exist
echo "creating the Projects directory if it does not already exit"
mkdir -p "$clone_dir"

# Confirmation prompt function
confirm() {
    read -r -p "${1:-Are you sure? [Y/n]} " response
    case "$response" in
        [yY][eE][sS]|[yY]|"")
            true
            ;;
        *)
            false
            ;;
    esac
}

# Install the AWS CLI, used to interact with any/all AWS services
if ! which aws > /dev/null ; then
  echo "brew installing aws cli session-manager-plugin"
	brew install awscli session-manager-plugin
fi

# Install jq, a command line utility for parsing JSON.
if ! which jq > /dev/null ; then
  echo " brew installing jq"
	brew install jq
fi

# Install nvm, a version manager for Node, allowing multiple versions of Node to be installed and used
echo "brew installing nvm"
brew install nvm
echo "creating ~/.nvm if it does no exist"
mkdir -p ~/.nvm

# Source NVM script and set up NVM environment
export NVM_DIR="$HOME/.nvm"
echo "sourcing nvm.sh"
source $(brew --prefix nvm)/nvm.sh

# Optional: Add NVM initialization to shell profile for future sessions
if ! grep -q 'source $(brew --prefix nvm)/nvm.sh' $shellprofile; then
  echo 'export NVM_DIR="$HOME/.nvm"' >> $shellprofile
  echo 'source $(brew --prefix nvm)/nvm.sh' >> $shellprofile
fi

# Install/Update pre-commit
echo "brew installing/updating pre-commit"
brew install pre-commit

# Install java with brew
if [[ ! $(which java) =~ "$(brew --prefix)/opt/openjdk" ]] ; then
  echo "brew installing java"
	brew install java
  # Get the directory where java is installed
  java_home=$(brew --prefix)/opt/openjdk

  # Add java to PATH
  echo "adding java to PATH"
  echo "export PATH=\"$java_home/bin:\$PATH\"" >> "$shellprofile"
  # echo "Java installed successfully and added to PATH."
  source $shellprofile
  # Check if java is installed and add it to PATH if necessary
  if [[ ! $(which java) =~ "$(brew --prefix)/opt/openjdk" ]] ; then
      echo "Java installation failed." && exit 1
  fi
fi

# Install awslogs, a utility for streaming CloudWatch logs
if ! which awslogs > /dev/null ; then
  echo "brew installing awslogs"
  brew install awslogs
fi

# Install git, our version control system
if ! which git > /dev/null ; then
  echo "brew installing git"
  brew install git
fi

# Install GitHub CLI, our version control system
if ! which gh > /dev/null ; then
  echo "brew installing GitHub cli"
  brew install gh
fi

# Install 1Password CLI
if ! which op > /dev/null ; then
  echo "brew installing 1Password CLI"
  brew install --cask 1password-cli
fi

# Install snyk cli
if ! which snyk > /dev/null ; then
  echo "brew installing Snyk CLI"
  brew install snyk-cli
fi

# Install Kion except on CI.
if [ "$CI" != "true" ]; then
  # Install Kion
  if ! which kion > /dev/null ; then
    echo "brew installing kion"
    brew install kionsoftware/tap/kion-cli
  fi

  # Output the kion configuration to a file in the home directory
  kion_config_file="$HOME/.kion.yml"

  if [ ! -f "$kion_config_file" ]; then
    echo "creating a kion config file"
    read -p "Please enter your EUA ID to be used for Kion CLI. If you do not have an EUA ID yet enter your first name to temporarily proceed: " user_id
    cat <<EOL > $kion_config_file
kion:
  url: https://cloudtamer.cms.gov
  api_key: ""
  username: $user_id
  idms_id: "2"
  saml_metadata_file: ""
  saml_sp_issuer: ""
EOL
    echo "Kion configuration file created at $kion_config_file"
  else
    echo "Kion configuration file already exists at $kion_config_file. Skipping creation."
  fi
fi

# Loop through each repository URL
echo "Begin cloning/looping through repos"
for url in "${repo_urls[@]}"; do
    # Extract the repository name from the URL
    repo_name=$(basename "$url" .git)

    # Clone the repository if it doesn't exist
    if [ ! -d "$clone_dir/$repo_name" ]; then
        echo "Cloning $repo_name..."
        git clone "$url" "$clone_dir/$repo_name"

        # Check if clone was successful
        if [ $? -eq 0 ]; then
            echo "Cloned $repo_name successfully."
        else
            echo "Failed to clone $repo_name."
            continue
        fi
    else
        echo "$repo_name already exists. Skipping cloning."
    fi

    # Navigate into the cloned repository directory
    cd "$clone_dir/$repo_name"

    # Run the "pre-commit install" command
    echo "Running pre-commit install in $repo_name..."
    pre-commit install --hook-type pre-commit --hook-type commit-msg

    # Check if pre-commit install was successful
    if [ $? -eq 0 ]; then
        echo "pre-commit installed successfully in $repo_name."
    else
        echo "Failed to install pre-commit in $repo_name."
    fi

    # Ensure repository is on main branch
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    if [ "$current_branch" != "main" ]; then
        echo "Error: $repo_name is not on the main branch. Please commit any outstanding changes and switch to the main branch before running this script."
        exit 1
    fi

    # Pull latest changes from main branch
    echo "Pulling latest changes in $repo_name..."
    git pull origin "$current_branch"

    # Check if pull was successful
    if [ $? -eq 0 ]; then
        echo "Pulled latest changes successfully in $repo_name."
    else
        echo "Failed to pull latest changes in $repo_name."
        continue
    fi

    cp .vscode/settings.json.template .vscode/settings.json

    [ ! -f ".nvmrc" ] && continue

    # install correct version of node using the .nvmrc
    echo "Installing the correct node version"
    nvm install

    # check yarn exists with corepack
    corepack enable 2>/dev/null || true

    # Check if node_modules directory exists
    if [ -d "node_modules" ]; then
        echo "node_modules directory found in $repo_name. Removing its contents..."
        rm -rf node_modules
    fi
    # Run yarn in top level of repo
    echo "Running yarn"
    yarn

    # Check if yarn was successful
    if [ $? -eq 0 ]; then
        echo "yarn completed successfully in $repo_name."
    else
        echo "Failed to run yarn in $repo_name."
    fi

    # Navigate back to the original directory
    cd -
done

# Install Docker
if ! which docker > /dev/null ; then
  echo "brew installing docker"
  brew install docker
fi

# Install Colima
if ! which colima > /dev/null ; then
  echo "brew installing colima"
  brew install colima
fi

# Install LocalStack
if ! which localstack > /dev/null ; then
  echo "brew installing localstack/tap/localstack-cli"
  brew install localstack/tap/localstack-cli
fi

echo " Congratulations! The script ran successfully. Here is a free taco for your time.
⠀⠀⠀⠀⠀⠀⠀⠀⣄⠀⠀⢀⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⢀⣄⠀⠀⢻⣇⠀⠀⢻⠀⠀⠺⠀⠀⠤⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡿⠀⠀⢰⡟⠀⠀⠀⣴⡖⠀⠀⠀⠀
⠀⠀⠀⠀⠈⠻⣇⠀⠀⠻⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠶⣄⠀⠀⠀⢠⠞⢳⡀⠀⠀⠀⢀⣤⢶⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠋⠀⠀⢀⠞⠁⠀⢀⣤⠀⠀
⠀⠀⠀⡀⠀⠀⠙⢧⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⡟⠓⢦⣀⠀⢀⡞⠀⠈⠳⣄⡴⠋⠀⠀⠳⣄⡠⠞⠉⠀⠘⣆⠀⠀⠀⢀⣤⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠞⠋⠀⠀
⠀⠀⠘⠿⣦⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⡇⠀⠀⠈⠳⠞⠀⠀⠀⠀⠈⠁⠀⠀⣀⣀⣉⣀⣀⡀⠀⠀⢿⣀⡤⠚⠉⢸⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⣴⠦
⠀⠀⡀⠀⠈⠁⠀⠀⠀⠀⠀⠀⠀⡏⠓⠒⠢⣤⣴⡥⠤⢴⡀⠀⠀⠀⠀⠀⠀⢀⡤⠖⠋⠉⠉⠀⠀⢸⠁⠀⠀⠈⠁⣀⣠⣤⠼⠧⢤⡀⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀
⠀⠀⠙⠂⠀⠀⠀⠀⢀⣀⣤⡀⠀⡇⣠⠖⠋⠉⠂⠀⠀⢦⢳⠀⠀⠀⠀⠀⣠⠏⠀⠀⠀⠀⠀⠀⠀⣾⠀⠀⢀⣴⠛⠉⠀⠀⠀⠀⠀⠈⠳⣍⡏⠀⠀⠀⢀⣀⣀⠀⠀⠀⠐⠛
⠀⠀⠀⣀⣠⠴⠖⠋⠉⠁⠈⢿⢦⡇⢸⠀⠀⠀⠀⣦⠀⠀⡏⢧⠀⠀⠀⢰⠇⠀⠀⠀⢀⣶⠟⡿⢹⡏⢀⡴⡿⠁⠀⠀⠀⣠⣤⣀⠀⠀⢷⠘⣆⠀⠀⣠⣾⠁⠀⠉⠓⢦⡀⣠
⢠⢶⣻⠽⠒⠀⠂⠀⠀⠀⠀⠘⣇⢹⢸⠀⠀⠀⠀⣿⣧⠀⠘⣎⣇⠀⠀⣾⠀⠀⠀⢠⢼⣿⡾⢤⡾⢀⣾⢿⠃⠀⠀⢎⣞⡁⠀⠈⣧⠀⠈⠀⠹⣄⡴⣻⠃⠀⠀⠀⠄⣴⠃⠀
⠘⣏⠀⠀⠀⠀⡄⠀⠠⣤⡖⠚⠻⣌⡏⡇⠀⠀⠀⠻⠽⠀⠀⠘⠜⣆⢸⣿⡄⠀⠀⠘⠜⠧⠤⠤⣤⣾⢅⣿⠀⠀⠈⣾⠉⠙⢦⠀⣼⠀⠀⠀⢠⡏⢠⠇⠀⠀⢀⡞⡴⠁⠀⠀
⠀⠹⣆⣀⣤⢾⡇⠀⠸⡘⡽⢄⣀⡼⠻⡇⠀⠀⠀⢀⣠⣤⠀⠀⠀⠸⣾⡏⢷⡄⠀⠀⠀⠀⠀⠂⢸⡇⢊⣿⡀⠀⠀⡸⣄⠀⣸⡷⠃⠀⠀⠀⣾⢠⡏⠀⠀⢀⣞⡾⠁⠀⠀⠀
⠀⠀⠙⠲⢤⣄⣧⠀⠀⠁⢻⡀⣧⠀⠀⡇⠀⠀⠀⣿⣧⠙⣇⠀⠀⠀⠙⣇⣸⢿⢦⣀⠀⠀⠀⠀⠀⣷⡵⡉⢧⠀⠀⠉⠌⠍⠁⠀⠀⠀⢀⣾⣯⣞⠀⠀⠀⣨⡎⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⢀⣸⡇⠀⠀⠈⢧⠸⡄⠀⡇⠀⠀⠀⢸⣟⣆⣹⣧⡤⣶⡖⢺⣿⠀⣰⣬⣙⢛⡛⡿⣿⢿⣀⠀⠉⠳⣄⣀⠀⠀⠀⣀⣠⣼⣿⣻⣏⣈⣙⣳⡾⠉⢉⡿⠀⠀⠀⠀
⠀⢰⣴⠒⠛⠉⠀⢹⠀⠀⠀⠘⣇⢳⠀⢹⣀⢤⡴⣺⣏⣹⠈⣿⣄⣹⣷⣾⣿⣷⣿⣾⣿⠾⣿⣳⣿⣿⠿⢦⣄⣤⡀⢈⠉⢉⢉⡫⠞⢁⣿⣟⠁⠀⠈⣻⣠⠔⠋⠀⠀⠀⠀⠀
⠀⠀⠈⠙⢦⡀⠀⠈⣇⠀⣀⡤⠾⠯⣧⠘⢯⣣⣵⣷⣿⣿⢶⣿⣋⣿⣽⠿⢯⡬⠛⣫⣿⣿⣟⣿⣻⣿⣿⣤⣿⡿⠶⣗⠚⠛⠉⠀⠀⢼⠟⠘⠓⢤⡴⠛⢧⣄⡀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠈⣲⠄⠘⠻⠥⣤⣠⠴⣺⣥⣴⣋⣷⣾⣿⣽⣿⣶⣾⣿⣿⣭⣭⣷⣞⠡⠟⢉⣽⡟⠻⣽⣿⣶⣿⣿⣷⡈⢙⣦⣄⠀⠀⠈⠒⠒⠒⠋⠀⠀⠀⠀⠉⠳⣦⡄⠀⠀
⠀⠀⠀⢀⡴⠋⠁⠀⠀⠀⠀⢀⣤⣾⣥⣾⡿⠿⠛⠉⠉⠉⢀⠄⠀⠈⠉⡉⠙⠻⠿⣻⢶⣧⣉⠉⣉⣉⣹⣦⢱⣿⣿⠿⣿⡄⢻⣷⣄⡀⠀⠀⠀⠀⠀⠀⠀⢀⣤⠞⠉⠀⠀⠀
⠀⠠⢾⣋⣀⠀⠀⠀⠀⠀⠀⣸⡿⠟⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠀⡙⠻⣟⢿⣅⡀⣠⠿⣍⠉⣿⠠⠿⣤⠚⢻⣮⡻⣦⡀⠀⠀⠀⠠⣞⠋⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠈⠉⢓⡆⠀⢀⣾⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠰⠉⡿⢿⣿⣯⣻⣾⣿⡿⢿⣦⣾⣄⡼⣿⢽⢮⡳⣄⠀⠀⠀⠈⠳⣤⡀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣠⠎⠀⢠⡿⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠐⠀⠀⠐⠁⢈⠟⣿⣿⣦⣀⡿⢷⣽⡟⠉⢳⣥⢪⣷⢻⣿⣦⡀⠀⠀⠀⠈⣿⡆⠀⠀⠀
⠀⠀⠀⢀⡼⠁⠀⢠⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠊⣻⣞⢿⣦⣤⣼⣦⣾⣿⣿⣶⣾⣏⣹⣾⢷⣤⡴⠞⠋⠀⠀⠀⠀⠀
⠀⠀⠀⠉⠁⠒⢲⡾⠀⠀⠀⠀⠀⠀⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⠁⡸⢳⡻⣿⣽⣇⢀⣈⣿⣿⣿⡛⢯⣻⣿⣷⣄⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣼⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠂⠱⣟⣿⣏⣻⣿⣿⣿⣿⣿⣷⣿⢿⠻⣯⣳⡄⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣸⡇⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠘⣟⣿⣿⡇⢙⡟⠻⠩⠉⠸⣿⡇⢿⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⣿⡇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⢀⠙⣎⢿⣷⡈⠀⢛⠁⢀⠀⣱⡇⢸⠂⠀⠀⠀⠀⠀⠀
⠀⠰⠂⠀⠀⠙⢷⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠰⠘⢮⡻⣿⡃⣀⣂⣡⣾⡿⣡⣿⠀⠀⠀⠀⠀⠀⠀
⠀⠀⣀⠀⠀⠀⠀⠈⠉⢻⠷⠶⠶⠶⠦⣤⣤⣄⣀⣄⣐⣀⣀⣀⣀⡀⠀⡀⠁⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠐⠛⡾⢿⣛⣿⣟⣋⣴⡿⠇⠀⠀⠀⠀⠀⢤⣀
⠀⠈⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡇⠀⠀⠀⢀⣠⠄⠈⠉⠉⠉⠉⠛⠛⠛⠛⠛⠛⠛⠛⠒⠒⠲⠶⠶⠶⠶⠶⣦⠤⠤⣤⣤⣴⣦⠾⠿⠛⠛⠉⠀⠀⠀⠀⠀⢄⠀⠀⠉
⠀⠀⣤⠖⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢣⣀⡤⠖⠋⠙⡇⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⣄⠀⠀⢰⠏⠀⠀⠀⠈⠉⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢷⣦⠀
⠀⠀⠀⠀⢀⣤⠎⠀⠀⠀⠀⠀⠀⠀⠀⠉⠁⠀⠀⠀⠀⣷⠀⠀⣠⠖⠉⢧⠀⠀⠀⣠⠛⢦⡀⠀⠀⢀⡞⠈⠑⢤⡞⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣄⠀⠀⢳⣄⠀⠀⠉⠀
⠀⠀⠀⠰⠟⠁⠀⢀⡴⠃⠀⠀⣰⠎⠀⠀⠀⠀⠀⠀⠀⣸⡶⠋⠁⠀⠀⠈⢧⣀⡴⠁⠀⠀⠉⢦⡀⡼⠁⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⣤⠀⠀⢹⣇⠀⠀⢻⣦⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣴⡟⠁⠀⢀⣾⠋⠀⢀⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠁⠀⠀⠀⠀⠀⠀⠙⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠇⠀⢸⡆⠀⠘⣧⠀⠀⢻⣧⠀⠈⠉⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢘⡟⠀⠀⠘⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠛⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀"
