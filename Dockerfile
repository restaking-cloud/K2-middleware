FROM public.ecr.aws/lambda/nodejs:14

RUN yum install python -y
RUN yum install make -y
RUN yum install gcc -y
RUN yum install gcc-c++ -y

COPY package.json .
COPY handler.js .
COPY response-utils.js .
COPY constants.js .
COPY services ./services
COPY abis ./abis
COPY env ./env
COPY handlers ./handlers

RUN npm install --only=production
