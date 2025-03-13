const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json());

// Lưu dữ liệu cảm biến mới nhất
let sensorData = {
    smoke: 0,
    gas: 0,
    infrared: 0,
    temperature: 0,
    humidity: 0,
    alarm: false
};

// Định nghĩa ngưỡng cảnh báo
const thresholds = {
    smoke: 3000,  // ppm
    gas: 3000,    // ppm
    infrared: 20  // %
};

// Cung cấp file HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "./public/index.html"));
});

// Nhận dữ liệu từ ESP32
app.post("/data", (req, res) => {
    sensorData = req.body;
    
    // Kiểm tra nếu có cảnh báo
    const fireDetected = (sensorData.smoke > thresholds.smoke && sensorData.gas > thresholds.gas) ||
                         (sensorData.smoke > thresholds.smoke && sensorData.infrared > thresholds.infrared) ||
                         (sensorData.gas > thresholds.gas && sensorData.infrared > thresholds.infrared);
    
    sensorData.alarm = fireDetected || sensorData.alarm;

    // Gửi dữ liệu đến tất cả client kết nối WebSocket
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(sensorData));
        }
    });

    console.log("Dữ liệu nhận được từ ESP32:", sensorData);
    res.send({ message: "Dữ liệu đã nhận", status: "OK" });
});

// Gửi dữ liệu khi có yêu cầu GET
app.get("/data", (req, res) => {
    res.json(sensorData);
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server chạy tại: http://localhost:${PORT}`);
});