set -e

# Script version
SCRIPT_VERSION="1.0.2"

# Define the clone directory and version file
clone_dir="$HOME/Projects"
version_file="$clone_dir/.mdct_workspace_setup_version"

#
# Define the URLs of the MDCT repositories
repo_urls=(
    "https://github.com/Enterprise-CMCS/macpro-mdct-carts.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-seds.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-qmr.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-mcr.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-mfp.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-hcbs.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-tools.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-core.git"
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

            # Check if the current branch is 'main' or 'master'
            if [[ "$current_branch" != "main" && "$current_branch" != "master" ]]; then
                echo "Repository $repo_name is not on the 'main' or 'master' branch. Please commit any changes you may have and checkout main or master to re-run the MDCT workspace setup script."
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
  if ! /usr/bin/pgrep -q oahd; then
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

# Check if the version file exists
if [ ! -f "$version_file" ]; then
    echo "It looks like you've never run the workspace setup script before. The MDCT team uses the workspace setup script to maintain a consistent development environment and brew to install as many packages as possible. The script will remove your ~/.nvm, ~/.npm, ~/go, and ~/.kion.yml folders/files if they already exist to ensure a consistent installation process."
    if confirm "Would you like to proceed with deleting these folders and continuing the setup? [Y/n]"; then
        echo "Proceeding with the setup..."
        
        # Remove ~/.nvm ~/.npm and ~/go folders
        echo "Removing ~/.nvm, ~/.npm, ~/.sesrverless, ~/go, and ~/.kion.yml folders and files if they exist..."
        rm -rf "$HOME/.nvm"
        rm -rf "$HOME/.npm"
        sudo rm -rf "$HOME/go"
        rm -rf "$HOME/.kion.yml"
        rm -rf "$HOME/.serverlessrc"
        rm -rf "$HOME/.serverless"
        
        # Create the version file
        echo "Creating version file at $version_file"
        echo "Setup script version: $SCRIPT_VERSION" > "$version_file"
    else
        echo "Exiting script."
        exit 0
    fi
else
    # Update the version file on subsequent runs
    echo "Updating version file at $version_file"
    echo "Setup script version: $SCRIPT_VERSION" > "$version_file"
fi

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
if [ "$CI" != "true" ]; then
  if [ ! -f ~/.nvm/nvm.sh ]; then
    echo "brew installing nvm"
    brew install nvm
  fi
else
  echo "brew is installing nvm"
  brew install nvm
fi
echo "creating ~/.nvm if it does no exist"
mkdir -p ~/.nvm

# Source NVM script and set up NVM environment
export NVM_DIR="$HOME/.nvm"
echo "sourcing nvm.sh"
source $(brew --prefix nvm)/nvm.sh

# Optional: Add NVM initialization to shell profile for future sessions
if [ "$shell" = "bash" ] && ! grep -q 'source $(brew --prefix nvm)/nvm.sh' $shellprofile; then
  echo 'export NVM_DIR="$HOME/.nvm"' >> $shellprofile
  echo 'source $(brew --prefix nvm)/nvm.sh' >> $shellprofile
fi

if [ "$shell" = "zsh" ] && ! grep -q 'source $(brew --prefix nvm)/nvm.sh' $shellprofile; then
  echo 'export NVM_DIR="$HOME/.nvm"' >> $shellprofile
  echo 'source $(brew --prefix nvm)/nvm.sh' >> $shellprofile
fi

# Install pre-commit
if ! which pre-commit > /dev/null ; then
  echo "brew installing pre-commit"
  brew install pre-commit
fi

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

# Install yarn, a node package manager similiar to npm
if ! which yarn > /dev/null ; then
  echo "brew installing yarn"
  brew install yarn
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

# Install 1password
if ! which op > /dev/null ; then
  echo "brew installing 1Password CLI"
  brew install 1password-cli
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
echo "Begin cloing/looping through repos"
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
    pre-commit install
    
    # Check if pre-commit install was successful
    if [ $? -eq 0 ]; then
        echo "pre-commit installed successfully in $repo_name."
    else
        echo "Failed to install pre-commit in $repo_name."
    fi

    # Ensure repository is on main or master branch
    current_branch=$(git rev-parse --abbrev-ref HEAD)
    if [ "$current_branch" != "main" ] && [ "$current_branch" != "master" ]; then
        echo "Error: $repo_name is not on the main or master branch. Please commit any outstanding changes and switch to the main/master branch before running this script."
        exit 1
    fi

    # Pull latest changes from main or master branch
    echo "Pulling latest changes in $repo_name..."
    git pull origin "$current_branch"
    
    # Check if pull was successful
    if [ $? -eq 0 ]; then
        echo "Pulled latest changes successfully in $repo_name."
    else
        echo "Failed to pull latest changes in $repo_name."
        continue
    fi
        
    [ ! -f ".nvmrc" ] && continue

    # install correct version of node using the .nvmrc
    echo "Installing the correct node version"
    nvm install

    # Check if node_modules directory exists
    if [ -d "node_modules" ]; then
        echo "node_modules directory found in $repo_name. Removing its contents..."
        rm -rf node_modules
    fi
    # Run yarn in top level of repo
    echo "Running yarn"
    yarn

    # Check if ui-src node_modules directory exists
    if [ -d "services/ui-src/node_modules" ]; then
        echo "services/ui-src/node_modules directory found. Removing its contents..."
        rm -rf services/ui-src/node_modules
    fi

    # Run yarn in /services/ui-src/ directory
    echo "Running yarn in /services/ui-src/ directory..."
    (cd services/ui-src/ && yarn)

    # Check if app-api node_modules directory exists
    if [ -d "services/app-api/node_modules" ]; then
        echo "services/app-api/node_modules directory found. Removing its contents..."
        rm -rf services/app-api/node_modules
    fi

    # Run yarn in /services/app-api/ directory
    echo "Running yarn in /services/app-api/ directory..."
    (cd services/app-api/ && yarn)

    # Check if database node_modules directory exists
    if [ -d "services/database/node_modules" ]; then
        echo "services/database/node_modules directory found. Removing its contents..."
        rm -rf services/database/node_modules
    fi

    # Run yarn in /services/app-api/ directory
    echo "Running yarn in /services/database/ directory..."
    (cd services/database/ && yarn)

    # Check if ui node_modules directory exists
    if [ -d "services/ui/node_modules" ]; then
        echo "services/ui/node_modules directory found. Removing its contents..."
        rm -rf services/ui/node_modules
    fi

    # Run yarn in /services/app-api/ directory
    echo "Running yarn in /services/ui/ directory..."
    (cd services/ui/ && yarn)

    # Check if ui-auth node_modules directory exists
    if [ -d "services/ui-auth/node_modules" ]; then
        echo "services/ui-auth/node_modules directory found. Removing its contents..."
        rm -rf services/ui-auth/node_modules
    fi

    # Run yarn in /services/app-api/ directory
    echo "Running yarn in /services/ui-auth/ directory..."
    (cd services/ui-auth/ && yarn)

    # Check if uploads node_modules directory exists
    if [ -d "services/uploads/node_modules" ]; then
        echo "services/uploads/node_modules directory found. Removing its contents..."
        rm -rf services/uploads/node_modules
    fi

    # Run yarn in /services/app-api/ directory
    echo "Running yarn in /services/uploads/ directory..."
    (cd services/uploads/ && yarn)

    # Check if tests/cypress node_modules directory exists
    if [ -d "tests/cypress/node_modules" ]; then
        echo "tests/cypress/node_modules directory found. Removing its contents..."
        rm -rf tests/cypress/node_modules
    fi

    # If the tets live in tests/cypress ... run yarn there
    if [ -d "tests/cypress" ]; then
        echo "running yarn in the tests/cypress folder...."
        (cd tests/cypress && yarn)
    fi

    # Check if tests node_modules directory exists
    if [ -d "tests/node_modules" ]; then
        echo "tests/node_modules directory found. Removing its contents..."
        rm -rf tests/node_modules
    fi

    # If the tets live in tests ... run yarn there
    if [ -f "tests/package.json" ]; then
        echo "running yarn in the tests folder...."
        (cd tests && yarn)
    fi
    
    # Check if yarn was successful
    if [ $? -eq 0 ]; then
        echo "yarn completed successfully in $repo_name."
    else
        echo "Failed to run yarn in $repo_name."
    fi
    
    # Navigate back to the original directory
    cd -
done

# Install serverless
if ! which sls > /dev/null ; then
  echo "npm installing serverless v3.38.0"
  npm install -g serverless@3.38.0
fi

# Install dynamodb-admin
if ! which dynamodb-admin > /dev/null ; then
  echo "npm installing dynamodb-admin"
  npm install -g dynamodb-admin
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
