FROM node:20-alpine

WORKDIR /app

# Install dependencies dulu (biar cache layer lebih efisien)
COPY package*.json ./
RUN npm install --omit=dev

# Copy semua source code
COPY . .

# Pastikan folder data & uploads ada dan bisa ditulis
RUN mkdir -p data public/uploads

# Back4app Containers mengarahkan traffic ke port 8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
