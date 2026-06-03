FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci --silent

COPY . .
ARG REACT_APP_API_URL=http://localhost:3000/api/v1
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
