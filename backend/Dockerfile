FROM node:24.18.0

WORKDIR /globalyapp/backend

RUN apt-get update && apt-get install -y nginx \
        wget \
        nano \
        dnsutils \
        net-tools \
        git \
        curl \
        cmake \
        unzip \
        build-essential \
        software-properties-common \
        zip \
        cron \
        gpg

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 80

RUN rm -f /etc/nginx/sites-enabled/default
COPY devops-tmp/nginx/nginx.conf /etc/nginx/nginx.conf
COPY devops-tmp/nginx/backend/globalyapp-backend.conf /etc/nginx/conf.d/backend.conf

CMD ["bash", "-c", "service nginx start && npm start"]
