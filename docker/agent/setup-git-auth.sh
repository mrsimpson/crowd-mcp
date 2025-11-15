#!/bin/bash
# Note: Removed 'set -e' to prevent container exit on non-critical failures

# Git Authentication Setup Script
# Configures Git to use Personal Access Tokens for HTTPS authentication

echo "🔑 Setting up Git authentication with Personal Access Tokens..."

# Initialize authentication status
AUTH_CONFIGURED=false

# Configure GitHub authentication
if [ -n "$GITHUB_TOKEN" ]; then
    echo "🐙 Configuring GitHub authentication..."
    git config --global credential."https://github.com".helper "!f() { echo username=token; echo password=$GITHUB_TOKEN; }; f"
    git config --global url."https://github.com/".insteadOf "git@github.com:"
    git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
    AUTH_CONFIGURED=true
    echo "✅ GitHub authentication configured"
else
    echo "ℹ️  No GITHUB_TOKEN found - GitHub repositories will require public access"
fi

# Configure GitLab authentication  
if [ -n "$GITLAB_TOKEN" ]; then
    echo "🦊 Configuring GitLab authentication..."
    git config --global credential."https://gitlab.com".helper "!f() { echo username=oauth2; echo password=$GITLAB_TOKEN; }; f"
    git config --global url."https://gitlab.com/".insteadOf "git@gitlab.com:"
    git config --global url."https://gitlab.com/".insteadOf "ssh://git@gitlab.com/"
    AUTH_CONFIGURED=true
    echo "✅ GitLab authentication configured"
else
    echo "ℹ️  No GITLAB_TOKEN found - GitLab repositories will require public access"
fi

# Set global Git configuration for better compatibility
git config --global user.name "${GIT_USER_NAME:-Agent Bot}"
git config --global user.email "${GIT_USER_EMAIL:-agent@crowd-mcp.local}"

# Disable SSH host key checking for Git operations (since we're using HTTPS)
git config --global core.sshCommand "ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no"

if [ "$AUTH_CONFIGURED" = true ]; then
    echo "✅ Git authentication setup complete! Supported providers:"
    [ -n "$GITHUB_TOKEN" ] && echo "   - GitHub (via Personal Access Token)"
    [ -n "$GITLAB_TOKEN" ] && echo "   - GitLab (via Personal Access Token)"
else
    echo "⚠️  No authentication tokens found. Only public repositories will be accessible."
    echo "   Set GITHUB_TOKEN and/or GITLAB_TOKEN environment variables for private repository access."
fi