FROM node:22-bookworm

# UID/GID matching — must match host user (CONT-02)
# Passed as build args at image creation time via `docker build --build-arg`
ARG UID=1000
ARG GID=1000

# Timezone (optional, mirrors devcontainer convention)
ARG TZ
ENV TZ="${TZ:-UTC}"

# Install system packages required by Claude Code TUI (React Ink needs ncurses/libtinfo).
# Package list mirrors the Anthropic official devcontainer spec to ensure TUI compatibility.
RUN apt-get update && apt-get install -y --no-install-recommends \
    less \
    git \
    procps \
    sudo \
    fzf \
    zsh \
    man-db \
    unzip \
    gnupg2 \
    gh \
    iptables \
    ipset \
    iproute2 \
    dnsutils \
    aggregate \
    jq \
    nano \
    vim \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set DEVCONTAINER marker so Claude Code uses the correct TUI code path
ENV DEVCONTAINER=true

# Configure npm global prefix (mirrors devcontainer spec)
RUN mkdir -p /usr/local/share/npm-global && chown -R root:root /usr/local/share/npm-global
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Install Claude Code CLI (CONT-04)
# IMPORTANT: Use @anthropic-ai/claude-code — NOT @anthropic-sdk/claude-code (wrong package)
RUN npm install -g @anthropic-ai/claude-code@latest

# Install GSD (get-shit-done-cc) into Claude Code's global config
RUN npx get-shit-done-cc --claude --global

# Create sandbox user with matching UID/GID
RUN groupadd -f -g ${GID} sandbox && \
    useradd -m -u ${UID} -g ${GID} -s /bin/bash sandbox

# Allow sandbox user to use sudo (needed for iptables — mirrors devcontainer pattern)
RUN echo "sandbox ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/sandbox && \
    chmod 0440 /etc/sudoers.d/sandbox

# Copy and configure entrypoint for secrets injection (AUTH-01)
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Switch to sandbox user
USER sandbox

# Source the API key secret in every interactive bash session so exec
# sessions (which bypass entrypoint.sh) still get ANTHROPIC_API_KEY.
RUN echo 'if [ -f /run/secrets/anthropic-api-key ]; then export ANTHROPIC_API_KEY=$(cat /run/secrets/anthropic-api-key); fi' \
    >> /home/sandbox/.bashrc

# Wrapper: restore terminal state after claude exits.
# Claude Code uses raw mode; if it exits without cleanup the shell becomes
# unresponsive (no echo, Enter ignored). `stty sane` resets the TTY.
RUN echo 'claude() { command claude "$@"; stty sane; }' \
    >> /home/sandbox/.bashrc

# Default working directory is /workspace (all repos mounted here)
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# sleep infinity keeps the container alive without holding a PTY.
# Exec sessions (docker exec -it) each get their own fresh PTY so that
# setRawMode() works correctly for interactive TUI apps like Claude Code.
CMD ["sleep", "infinity"]
