const express = require("express");          // Nhập thư viện Express - framework để xây dựng server HTTP, xử lý request/response.
const bodyParser = require("body-parser");   // Nhập thư viện body-parser - middleware để phân tích dữ liệu JSON từ request.
const cors = require("cors");                // Nhập thư viện CORS - middleware để cho phép truy cập từ các nguồn gốc khác (cross-origin).
const path = require("path");                // Nhập thư viện path - module Node.js để xử lý đường dẫn file và thư mục.
const http = require("http");                // Nhập thư viện HTTP - module Node.js để tạo server HTTP cơ bản.
const WebSocket = require("ws");             // Nhập thư viện WebSocket - để tạo kết nối WebSocket, hỗ trợ giao tiếp thời gian thực.
const nodemailer = require("nodemailer");    // Nhập thư viện Nodemailer - để gửi email thông qua giao thức SMTP.

const app = express();                       // Khởi tạo ứng dụng Express - tạo một instance của Express để xử lý các route.
const server = http.createServer(app);       // Tạo server HTTP - sử dụng app Express làm handler cho các request HTTP.
const wss = new WebSocket.Server({ server }); // Tạo server WebSocket - gắn vào server HTTP để hỗ trợ kết nối thời gian thực.

app.use(cors());                             // Sử dụng middleware CORS - cho phép tất cả các nguồn gốc truy cập server (tránh lỗi CORS).
app.use(bodyParser.json());                  // Sử dụng middleware body-parser - phân tích dữ liệu JSON từ body của request.

// Lưu dữ liệu cảm biến mới nhất
let sensorData = {                           // Khai báo đối tượng lưu dữ liệu cảm biến - lưu giá trị mới nhất từ ESP32.
    smoke: 0,                                // Giá trị khói (ppm) - khởi tạo bằng 0.
    gas: 0,                                  // Giá trị khí gas (ppm) - khởi tạo bằng 0.
    infrared: 0,                             // Giá trị hồng ngoại (%) - khởi tạo bằng 0.
    temperature: 0,                          // Giá trị nhiệt độ (°C) - khởi tạo bằng 0.
    humidity: 0,                             // Giá trị độ ẩm (%) - khởi tạo bằng 0.
    alarm: false                             // Trạng thái báo động - false là tắt, true là bật.
};

// Biến để theo dõi trạng thái báo động và thời gian gửi email
let previousAlarmState = false;              // Trạng thái báo động trước đó - dùng để phát hiện thay đổi từ không báo động sang báo động.
let lastEmailSentTime = 0;                   // Thời điểm gửi email cuối cùng - lưu thời gian (ms) khi email được gửi, khởi tạo bằng 0.
const emailCooldown = 5 * 60 * 1000;         // Thời gian chờ giữa các email - 5 phút (300,000 ms) để tránh spam email.

// Ngưỡng cảnh báo 
const thresholds = {                         // Khai báo đối tượng lưu ngưỡng cảnh báo - đồng bộ với ESP32 để kiểm tra cháy.
    smoke: 5500,                             // Ngưỡng khói (ppm) - nếu vượt 5500 ppm, coi là có nguy cơ cháy.
    gas: 3000,                               // Ngưỡng khí gas (ppm) - nếu vượt 3000 ppm, coi là có nguy cơ cháy.
    infrared: 80,                            // Ngưỡng hồng ngoại (%) - nếu vượt 80%, kết hợp với điều kiện khác sẽ báo cháy.
    temperature: 35                          // Ngưỡng nhiệt độ (°C) - nếu vượt 35°C, coi là có nguy cơ cháy.
};

// Cấu hình Nodemailer
const transporter = nodemailer.createTransport({ // Tạo đối tượng gửi email - cấu hình Nodemailer để gửi email qua Gmail.
    service: "gmail",                        // Dịch vụ email - sử dụng Gmail làm nhà cung cấp SMTP.
    auth: {                                  // Thông tin xác thực - để đăng nhập vào tài khoản Gmail.
        user: process.env.EMAIL_USER,        // Email người gửi - lấy từ biến môi trường (cần khai báo trong .env hoặc hệ thống).
        pass: process.env.EMAIL_PASS         // Mật khẩu ứng dụng - lấy từ biến môi trường (không phải mật khẩu Gmail thông thường).
    }
});

// Hàm gửi email
async function sendAlertEmail() {            // Hàm gửi email cảnh báo - gửi thông báo khi phát hiện nguy cơ cháy (async để xử lý bất đồng bộ).
    const mailOptions = {                    // Đối tượng cấu hình email - chứa thông tin email sẽ gửi.
        from: process.env.EMAIL_USER,        // Người gửi - email lấy từ biến môi trường.
        to: "kieuson9a2@gmail.com",          // Người nhận - địa chỉ email cố định để nhận cảnh báo.
        subject: "CẢNH BÁO CHÁY!",           // Tiêu đề email - thông báo nguy cơ cháy.
        text: `Hệ thống phát hiện nguy cơ cháy!\n\nDữ liệu hiện tại:\n- Khói: ${sensorData.smoke.toFixed(2)} ppm\n- Gas: ${sensorData.gas.toFixed(2)} ppm\n- Hồng ngoại: ${sensorData.infrared.toFixed(2)}%\n- Nhiệt độ: ${sensorData.temperature.toFixed(1)}°C\n- Độ ẩm: ${sensorData.humidity.toFixed(1)}%`, // Nội dung dạng text - thông tin cảm biến, làm tròn số thập phân.
        html: `<h2>CẢNH BÁO CHÁY!</h2><p>Hệ thống phát hiện nguy cơ cháy!</p><ul><li>Khói: ${sensorData.smoke.toFixed(2)} ppm</li><li>Gas: ${sensorData.gas.toFixed(2)} ppm</li><li>Hồng ngoại: ${sensorData.infrared.toFixed(2)}%</li><li>Nhiệt độ: ${sensorData.temperature.toFixed(1)}°C</li><li>Độ ẩm: ${sensorData.humidity.toFixed(1)}%</li></ul>` // Nội dung dạng HTML - định dạng đẹp hơn khi hiển thị trên email.
    };

    try {                                    // Xử lý gửi email - dùng try-catch để bắt lỗi nếu gửi thất bại.
        await transporter.sendMail(mailOptions); // Gửi email - gọi hàm sendMail từ Nodemailer, chờ hoàn tất (await).
        console.log("Email cảnh báo đã được gửi!"); // In thông báo thành công - hiển thị trên console server.
        lastEmailSentTime = Date.now();      // Cập nhật thời điểm gửi - lưu thời gian hiện tại (ms) để tính cooldown.
    } catch (error) {                        // Bắt lỗi nếu gửi email thất bại.
        console.error("Lỗi khi gửi email:", error); // In lỗi - hiển thị chi tiết lỗi trên console server.
    }
}

// Cung cấp file HTML
app.get('/', (req, res) => {                 // Xử lý yêu cầu GET tới đường dẫn "/" - cung cấp giao diện web cho người dùng.
    res.sendFile(path.join(__dirname, "./public/index.html")); // Gửi file HTML - dùng path.join để tạo đường dẫn tới file index.html trong thư mục public.
    // __dirname: đường dẫn thư mục hiện tại của file server.js.
});

// Nhận dữ liệu từ ESP32
app.post("/data", (req, res) => {            // Xử lý yêu cầu POST tới "/data" - nhận dữ liệu từ ESP32.
    sensorData = req.body;                   // Cập nhật dữ liệu cảm biến - lấy dữ liệu từ body của request (JSON từ ESP32).

    // Logic phát hiện cháy (đồng bộ với Arduino)
    const fireDetected = (sensorData.gas > thresholds.gas) || // Kiểm tra điều kiện cháy - nếu gas vượt ngưỡng.
                         (sensorData.smoke > thresholds.smoke && sensorData.infrared > thresholds.infrared) || // Hoặc khói và hồng ngoại cùng vượt ngưỡng.
                         (sensorData.gas > thresholds.gas && sensorData.infrared > thresholds.infrared) ||    // Hoặc gas và hồng ngoại cùng vượt ngưỡng.
                         (sensorData.temperature > thresholds.temperature); // Hoặc nhiệt độ vượt ngưỡng.

    sensorData.alarm = fireDetected || sensorData.alarm; // Cập nhật trạng thái báo động - true nếu phát hiện cháy hoặc giữ trạng thái thủ công từ ESP32.

    // Gửi email khi chuyển từ không báo động sang báo động
    if (sensorData.alarm && !previousAlarmState) { // Kiểm tra thay đổi trạng thái - nếu từ không báo động (false) sang báo động (true).
        const currentTime = Date.now();            // Lấy thời gian hiện tại - dùng Date.now() để lấy thời gian (ms).
        if (currentTime - lastEmailSentTime >= emailCooldown) { // Kiểm tra cooldown - nếu đã qua 5 phút kể từ email trước.
            sendAlertEmail();                      // Gửi email cảnh báo - gọi hàm sendAlertEmail().
        } else {                                   // Nếu chưa đủ thời gian cooldown.
            console.log("Email không gửi do chưa đủ thời gian cooldown."); // In thông báo - hiển thị lý do không gửi email.
        }
    }
    previousAlarmState = sensorData.alarm;         // Cập nhật trạng thái trước đó - lưu trạng thái hiện tại để so sánh lần sau.

    // Gửi dữ liệu qua WebSocket
    wss.clients.forEach(client => {                // Duyệt qua tất cả client WebSocket - gửi dữ liệu tới các trình duyệt đang kết nối.
        if (client.readyState === WebSocket.OPEN) { // Kiểm tra trạng thái client - chỉ gửi nếu kết nối đang mở.
            client.send(JSON.stringify(sensorData)); // Gửi dữ liệu - chuyển sensorData thành JSON và gửi qua WebSocket.
        }
    });

    console.log("Dữ liệu từ ESP32:", sensorData);   // In dữ liệu nhận được - hiển thị trên console server để kiểm tra.
    res.send({ message: "Dữ liệu đã nhận", status: "OK" }); // Gửi phản hồi cho ESP32 - thông báo đã nhận dữ liệu thành công.
});

// Gửi dữ liệu khi có yêu cầu GET
app.get("/data", (req, res) => {                 // Xử lý yêu cầu GET tới "/data" - trả về dữ liệu cảm biến hiện tại.
    res.json(sensorData);                        // Gửi dữ liệu dạng JSON - trả về đối tượng sensorData cho client (ví dụ: trình duyệt).
});

const PORT = process.env.PORT || 3000;           // Cấu hình cổng server - lấy từ biến môi trường hoặc mặc định là 3000.
server.listen(PORT, () => {                      // Khởi động server - lắng nghe các yêu cầu trên cổng PORT.
    console.log(`Server chạy tại: http://localhost:${PORT}`); // In thông báo - hiển thị URL server đang chạy trên console.
});