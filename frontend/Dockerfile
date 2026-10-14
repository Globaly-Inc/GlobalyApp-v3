FROM node:24.18.0
WORKDIR /globalyapp/frontend

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

ARG NEXT_PUBLIC_MOCK_DATA
ARG NEXT_PUBLIC_API_URL
# The public origin (src/lib/hosts.ts): absolute links, referral links, metadata. Unset = relative.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SESSION_HINT_COOKIE
ENV NEXT_PUBLIC_MOCK_DATA=$NEXT_PUBLIC_MOCK_DATA
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SESSION_HINT_COOKIE=$NEXT_PUBLIC_SESSION_HINT_COOKIE

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

ENV NODE_ENV=production
EXPOSE 80

RUN rm -f /etc/nginx/sites-enabled/default
COPY devops-tmp/nginx/nginx.conf /etc/nginx/nginx.conf
COPY devops-tmp/nginx/frontend/globalyapp-frontend.conf /etc/nginx/conf.d/globalyapp-frontend.conf

CMD ["bash", "-c", "service nginx start && yarn start"]
