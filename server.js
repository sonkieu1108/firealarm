const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const nodemailer = require("nodemailer");

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

// Biến để theo dõi trạng thái báo động và thời gian gửi email
let previousAlarmState = false;
let lastEmailSentTime = 0;
const emailCooldown = 5 * 60 * 1000; // 5 phút

// Ngưỡng cảnh báo (phải khớp với Arduino)
const thresholds = {
    smoke: 3000,    // ppm
    gas: 5000,      // ppm
    infrared: 50,   // %
    temperature: 50 // °C
};

// Cấu hình Nodemailer
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Hàm gửi email
async function sendAlertEmail() {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: "kieuson9a2@gmail.com",
        subject: "CẢNH BÁO CHÁY!",
        text: `Hệ thống phát hiện nguy cơ cháy!\n\nDữ liệu hiện tại:\n- Khói: ${sensorData.smoke.toFixed(2)} ppm\n- Gas: ${sensorData.gas.toFixed(2)} ppm\n- Hồng ngoại: ${sensorData.infrared.toFixed(2)}%\n- Nhiệt độ: ${sensorData.temperature.toFixed(1)}°C\n- Độ ẩm: ${sensorData.humidity.toFixed(1)}%`,
        html: `<h2>CẢNH BÁO CHÁY!</h2><p>Hệ thống phát hiện nguy cơ cháy!</p><ul><li>Khói: ${sensorData.smoke.toFixed(2)} ppm</li><li>Gas: ${sensorData.gas.toFixed(2)} ppm</li><li>Hồng ngoại: ${sensorData.infrared.toFixed(2)}%</li><li>Nhiệt độ: ${sensorData.temperature.toFixed(1)}°C</li><li>Độ ẩm: ${sensorData.humidity.toFixed(1)}%</li></ul>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Email cảnh báo đã được gửi!");
        lastEmailSentTime = Date.now();
    } catch (error) {
        console.error("Lỗi khi gửi email:", error);
    }
}

// Cung cấp file HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "./public/index.html"));
});

// Nhận dữ liệu từ ESP32
app.post("/data", (req, res) => {
    sensorData = req.body;

    // Logic phát hiện cháy (đồng bộ với Arduino)
    const fireDetected = (sensorData.gas > thresholds.gas) ||
                         (sensorData.smoke > thresholds.smoke && sensorData.infrared > thresholds.infrared) ||
                         (sensorData.gas > thresholds.gas && sensorData.infrared > thresholds.infrared) ||
                         (sensorData.temperature > thresholds.temperature);

    sensorData.alarm = fireDetected || sensorData.alarm; // Giữ trạng thái báo động thủ công nếu có

    // Gửi email khi chuyển từ không báo động sang báo động
    if (sensorData.alarm && !previousAlarmState) {
        const currentTime = Date.now();
        if (currentTime - lastEmailSentTime >= emailCooldown) {
            sendAlertEmail();
        } else {
            console.log("Email không gửi do chưa đủ thời gian cooldown.");
        }
    }
    previousAlarmState = sensorData.alarm;

    // Gửi dữ liệu qua WebSocket
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(sensorData));
        }
    });

    console.log("Dữ liệu từ ESP32:", sensorData);
    res.send({ message: "Dữ liệu đã nhận", status: "OK" });
});

// Gửi dữ liệu khi có yêu cầu GET
app.get("/data", (req, res) => {
    res.json(sensorData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server chạy tại: http://localhost:${PORT}`);
});