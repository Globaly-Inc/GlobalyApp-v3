FROM pyd4vinci/scrapling:latest

RUN addgroup --system globalyapp; exit 0
# This image's adduser (Debian trixie) rejects the short flags (-G/-s/-D) as
# ambiguous abbreviations, unlike older Debian/Ubuntu adduser — use long form.
RUN adduser --system --ingroup globalyapp --shell /bin/sh --disabled-password globalyapp; exit 0

RUN apt-get update && apt-get install -y \
    curl \
    jq \
    less \
    procps \
    net-tools \
    dnsutils \
    iputils-ping \
    traceroute \
    tcpdump \
    netcat-openbsd \
    telnet \
    lsof \
    strace \
    htop \
    vim \
    whois \
    mtr-tiny \
    ca-certificates \
    sudo \
    && rm -rf /var/lib/apt/lists/*

RUN echo "globalyapp ALL=(ALL) NOPASSWD: /usr/sbin/nginx, /usr/bin/nginx, /usr/sbin/service, /usr/bin/supervisord, /usr/bin/supervisorctl" > /etc/sudoers.d/globalyapp \
  && chown root:root /etc/sudoers.d/globalyapp \
  && chmod 0440 /etc/sudoers.d/globalyapp \
  && visudo -cf /etc/sudoers.d/globalyapp

RUN uv run patchright install chromium
ARG SCRAPLING_MCP_AUTH_TOKEN
ENV SCRAPLING_MCP_AUTH_TOKEN=${SCRAPLING_MCP_AUTH_TOKEN}
EXPOSE 8000

# Clear the base image's ENTRYPOINT so CMD below isn't appended to it
# (base image ships ENTRYPOINT ["uv", "run", "scrapling"]).
ENTRYPOINT []
CMD exec uv run scrapling mcp --http --host 0.0.0.0 --port 8000
    # Add every hostname/port clients will use to reach this server, e.g.:
    # --allowed-host scrapling.internal.example.com:8000
