FROM mcr.microsoft.com/playwright:v1.52.0-noble

WORKDIR /app
COPY . .

RUN npm install

# Important for persistent context compatibility
ENV HOME=/root

CMD ["node", "main.js"]