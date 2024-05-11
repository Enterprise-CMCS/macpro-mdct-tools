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

# Install git, our version control system 
if ! which op > /dev/null ; then
  brew install 1password-cli
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
    
    # Run the "pre-commit install" command
    echo "Running pre-commit install in $repo_name..."
    pre-commit install
    
    # Check if pre-commit install was successful
    if [ $? -eq 0 ]; then
        echo "pre-commit installed successfully in $repo_name."
    else
        echo "Failed to install pre-commit in $repo_name."
    fi
    
    # Navigate back to the original directory
    cd -
done

# todo 
# install npm
# install serverless 
# loop into each directory and install the correct version of node w/ nvm
# testing workflow using one pass ... grab stuff from onepass at test run time for e2e 
# .env workflow ... we check in the .tpl version of env files with op references 
# install java w/ brew 