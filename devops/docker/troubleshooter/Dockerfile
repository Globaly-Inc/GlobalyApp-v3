FROM ubuntu:24.04 AS php-base-image

RUN addgroup --system globalyapp; exit 0
RUN adduser --system -G globalyapp -s /bin/sh -D globalyapp; exit 0

WORKDIR /globalyapp

RUN apt-get update && apt-get install -y \
    git \
    nginx \
    jq \
    nano \
    vim \
    net-tools \
    dnsutils \
    iputils-ping \
    iproute2 \
    traceroute \
    tcpdump \
    netcat-openbsd \
    telnet \
    lsof \
    strace \
    htop \
    procps \
    less \
    unzip \
    zip \
    curl \
    wget \
    sudo \
    supervisor \
    ca-certificates \
    mtr-tiny \
    nmap \
    socat \
    sysstat \
    iotop \
    whois \
    rsync \
    tree \
    file \
    psmisc \
    openssl \
    iptables \
    postgresql-client \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

RUN echo "globalyapp ALL=(ALL) NOPASSWD: /usr/sbin/nginx, /usr/bin/nginx, /usr/sbin/service, /usr/bin/supervisord, /usr/bin/supervisorctl" > /etc/sudoers.d/globalyapp \
  && chown root:root /etc/sudoers.d/globalyapp \
  && chmod 0440 /etc/sudoers.d/globalyapp \
  && visudo -cf /etc/sudoers.d/globalyapp

USER globalyapp

CMD ["tail", "-f", "/dev/null"]

