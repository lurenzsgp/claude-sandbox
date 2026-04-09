FROM node:22-bookworm

# UID/GID matching — must match host user (CONT-02)
# Passed as build args at image creation time via `docker build --build-arg`
ARG UID=1000
ARG GID=1000

# Install Claude Code CLI (CONT-04)
# IMPORTANT: Use @anthropic-ai/claude-code — NOT @anthropic-sdk/claude-code (wrong package)
RUN npm install -g @anthropic-ai/claude-code@latest

# Create sandbox user with matching UID/GID
RUN groupadd -f -g ${GID} sandbox && \
    useradd -m -u ${UID} -g ${GID} -s /bin/bash sandbox

# Copy and configure entrypoint for secrets injection (AUTH-01)
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Switch to sandbox user
USER sandbox

# Default working directory is /workspace (all repos mounted here)
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/bin/bash"]
