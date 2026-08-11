FROM ubuntu:24.04 AS php-base-image

RUN addgroup --system globalyos; exit 0
RUN adduser --system -G globalyos -s /bin/sh -D globalyos; exit 0

WORKDIR /globalyos

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
    && rm -rf /var/lib/apt/lists/*

RUN echo "globalyos ALL=(ALL) NOPASSWD: /usr/sbin/nginx, /usr/bin/nginx, /usr/sbin/service, /usr/bin/supervisord, /usr/bin/supervisorctl" > /etc/sudoers.d/globalyos \
  && chown root:root /etc/sudoers.d/globalyos \
  && chmod 0440 /etc/sudoers.d/globalyos \
  && visudo -cf /etc/sudoers.d/globalyos

USER globalyos

CMD ["tail", "-f", "/dev/null"]

