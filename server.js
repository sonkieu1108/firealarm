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

// Biến để theo dõi trạng thái báo động trước đó
let previousAlarmState = false;

// Định nghĩa ngưỡng cảnh báo
const thresholds = {
    smoke: 3000,  // ppm
    gas: 3000,    // ppm
    infrared: 20  // %
};

// Cấu hình Nodemailer (dùng Gmail làm ví dụ)
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER, // Email của bạn từ biến môi trường
        pass: process.env.EMAIL_PASS  // Mật khẩu ứng dụng từ biến môi trường
    }
});

// Hàm gửi email
async function sendAlertEmail() {
    const mailOptions = {
        from: process.env.EMAIL_USER,           // Email người gửi
        to: "kieuson9a2@gmail.com",            // Email người nhận (thay bằng email của bạn)
        subject: "CẢNH BÁO CHÁY!",
        text: `Hệ thống phát hiện nguy cơ cháy!\n\nDữ liệu hiện tại:\n- Khói: ${sensorData.smoke.toFixed(2)} ppm\n- Gas: ${sensorData.gas.toFixed(2)} ppm\n- Hồng ngoại: ${sensorData.infrared.toFixed(2)}%\n- Nhiệt độ: ${sensorData.temperature.toFixed(1)}°C\n- Độ ẩm: ${sensorData.humidity.toFixed(1)}%`,
        html: `<h2>CẢNH BÁO CHÁY!</h2><p>Hệ thống phát hiện nguy cơ cháy!</p><ul><li>Khói: ${sensorData.smoke.toFixed(2)} ppm</li><li>Gas: ${sensorData.gas.toFixed(2)} ppm</li><li>Hồng ngoại: ${sensorData.infrared.toFixed(2)}%</li><li>Nhiệt độ: ${sensorData.temperature.toFixed(1)}°C</li><li>Độ ẩm: ${sensorData.humidity.toFixed(1)}%</li></ul>`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Email cảnh báo đã được gửi!");
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
    
    const fireDetected = (sensorData.smoke > thresholds.smoke && sensorData.gas > thresholds.gas) ||
                         (sensorData.smoke > thresholds.smoke && sensorData.infrared > thresholds.infrared) ||
                         (sensorData.gas > thresholds.gas && sensorData.infrared > thresholds.infrared);
    
    sensorData.alarm = fireDetected || sensorData.alarm;

    // Gửi email nếu chuyển từ không báo động sang báo động
    if (sensorData.alarm && !previousAlarmState) {
        sendAlertEmail();
    }
    previousAlarmState = sensorData.alarm;

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

// Gửi dữ liệu giả định kỳ (comment lại nếu dùng ESP32)
setInterval(() => {
    sensorData = {
        smoke: Math.random() * 5000 + 500,
        gas: Math.random() * 5000 + 500,
        infrared: Math.random() * 100,
        temperature: Math.random() * 40 + 20,
        humidity: Math.random() * 60 + 20,
        alarm: Math.random() > 0.8
    };
    
    const fireDetected = (sensorData.smoke > thresholds.smoke && sensorData.gas > thresholds.gas) ||
                         (sensorData.smoke > thresholds.smoke && sensorData.infrared > thresholds.infrared) ||
                         (sensorData.gas > thresholds.gas && sensorData.infrared > thresholds.infrared);
    
    sensorData.alarm = fireDetected || sensorData.alarm;

    // Gửi email nếu chuyển từ không báo động sang báo động
    if (sensorData.alarm && !previousAlarmState) {
        sendAlertEmail();
    }
    previousAlarmState = sensorData.alarm;

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(sensorData));
        }
    });

    console.log("Dữ liệu giả gửi đi:", sensorData);
}, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server chạy tại: http://localhost:${PORT}`);
});