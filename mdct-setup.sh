set -e

# Check that user is using MacOS
if [[ ! "$OSTYPE" =~ ^darwin ]]; then
  echo "ERROR:  This script is intended only for MacOS." && exit 1
fi

# Determine what shell and rc file we might want to modify
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
        shellprofile="$HOME/.zshenv"
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

# Install HomeBrew, an OSX package manager
if ! which brew > /dev/null ; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Set some things based on chip architecture
arch=`uname -m`
homebrewprefix=""
if [ "$arch" == "arm64" ]; then
  # If we're on Apple Silicon, check that Rosetta 2 has already been installed and is running.
  if ! /usr/bin/pgrep -q oahd; then
    echo "ERROR:  Rosetta must be installed on this machine before running this script, but was not found." && exit 1
  fi
  homebrewprefix="/opt/homebrew"
else
  homebrewprefix="/usr/local"
fi

export PATH="$homebrewprefix:$PATH"

# Install the AWS CLI, used to interact with any/all AWS services
if ! which aws > /dev/null ; then
	brew install awscli session-manager-plugin
fi

# Install jq, a command line utility for parsing JSON.
if ! which jq > /dev/null ; then
	brew install jq
fi

# Install nvm, a version manager for Node, allowing multiple versions of Node to be installed and used
if [ "$CI" != "true" ]; then
  if [ ! -f ~/.nvm/nvm.sh ]; then
    brew install nvm
  fi
else
  brew install nvm
fi
mkdir -p ~/.nvm

# Install pre-commit
if ! which pre-commit > /dev/null ; then
  brew install pre-commit
fi

# Install java with brew 
if ! which java > /dev/null ; then
	brew install java
fi

# Check if java is installed and add it to PATH if necessary
if ! which java > /dev/null ; then
    echo "Java installation failed."
else
    # Get the directory where java is installed
    java_home=$(brew --prefix)/opt/openjdk@11
    
    # Add java to PATH
    echo "export PATH=\"$java_home/bin:\$PATH\"" >> "$shellprofile"
    # echo "Java installed successfully and added to PATH."
fi

# Install awslogs, a utility for streaming CloudWatch logs
if ! which awslogs > /dev/null ; then
  brew install awslogs
fi

# Install yarn, a node package manager similiar to npm
if ! which yarn > /dev/null ; then
  brew install yarn
fi

# Install git, our version control system 
if ! which git > /dev/null ; then
  brew install git
fi

# Install 1password
if ! which op > /dev/null ; then
  brew install 1password-cli
fi

# Install go (needed to install kion)
if ! which go > /dev/null ; then
  brew install go
fi

# Install kion-cli, a go package used to authenticate to Kion and access AWS
go install github.com/kionsoftware/kion-cli@latest
touch ~/.kion.yml

# Define the URLs of the MDCT repositories
repo_urls=(
    "https://github.com/Enterprise-CMCS/macpro-mdct-carts.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-seds.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-qmr.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-mcr.git"
    "https://github.com/Enterprise-CMCS/macpro-mdct-mfp.git"
)

# Directory where repositories will be cloned
clone_dir="$HOME/Projects"

# Create the Projects directory if it doesn't exist
mkdir -p "$clone_dir"

# Loop through each repository URL
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

    # Load nvm if it's not already loaded
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        # Source nvm script
        . "$HOME/.nvm/nvm.sh"
    fi
    
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
        echo "Error: $repo_name is not on the main or master branch. Please switch to the main/master branch before running this script."
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
        
    # install correct version of node using the .nvmrc
    echo "Installing the correct node version"
    nvm install

    # Check if node_modules directory exists
    if [ -d "node_modules" ]; then
        echo "node_modules directory found in $repo_name. Removing its contents..."
        rm -rf node_modules/*
    fi
    
    # Run yarn from the top level of the repository
    echo "Running yarn in $repo_name..."
    yarn
    
    # Check if yarn was successful
    if [ $? -eq 0 ]; then
        echo "yarn completed successfully in $repo_name."
    else
        echo "Failed to run yarn in $repo_name."
    fi

    # rebuild clean
    
    # Navigate back to the original directory
    cd -
done

# Install serverless
if ! which sls > /dev/null ; then
  npm install -g serverless
fi

# Install dynamodb-admin
if ! which dynamodb-admin > /dev/null ; then
  npm install -g dynamodb-admin
fi

# todo 
# testing workflow using one pass ... grab stuff from onepass at test run time for e2e 
# .env workflow ... we check in the .tpl version of env files with op references 