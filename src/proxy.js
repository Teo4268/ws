/**
 * Dependencies
 */
var net        = require('net');
var mes        = require('./message');

/**
 * Constructor
 */
var Proxy = function Constructor(ws) {
	const to = ws.upgradeReq.url.substr(1);
	this._tcp;
	this._from = ws.upgradeReq.connection.remoteAddress;
	this._to   = Buffer.from(to, 'base64').toString();
	this._ws   = ws;

	// Bind data
	this._ws.on('message', this.clientData.bind(this) );
	this._ws.on('close', this.close.bind(this) );
	this._ws.on('error', (error) => {
		// FIX: Sử dụng mes.error để log lỗi một cách nhất quán nếu có
		mes.error("Lỗi WebSocket từ '%s': %s", this._from, error.message);
		this.close(); // Đảm bảo đóng kết nối khi có lỗi
	});

	// Initialize proxy
	var args = this._to.split(':');
	var host = args[0];
	// FIX: Chuyển đổi cổng sang kiểu số nguyên và kiểm tra tính hợp lệ
	var port = parseInt(args[1], 10);

	// FIX: Thêm logic xác thực cổng. Nếu cổng không hợp lệ, hủy kết nối.
	if (isNaN(port) || port <= 0 || port >= 65536) {
		mes.error("Yêu cầu kết nối từ '%s' đến '%s' [REJECTED - Cổng không hợp lệ hoặc bị thiếu].", this._from, this._to);
		this._ws.close();
		return; // Dừng thực thi để không gây ra lỗi crash
	}


	// Connect to server
	mes.info("Requested connection from '%s' to '%s' [ACCEPTED].", this._from, this._to);
	// FIX: Sử dụng các biến host và port đã được xác thực
	this._tcp = net.connect(port, host);

	// Disable nagle algorithm
	this._tcp.setTimeout(0)
	this._tcp.setNoDelay(true)

	this._tcp.on('data', this.serverData.bind(this) );
	this._tcp.on('close', this.close.bind(this) );
	this._tcp.on('error', (error) => {
        // FIX: Cung cấp thông điệp lỗi rõ ràng hơn
		mes.error("Lỗi kết nối TCP đến '%s': %s", this._to, error.message);
		this.close(); // Đóng kết nối khi có lỗi TCP
	});
	
	this._tcp.on('connect', this.connectAccept.bind(this) );
}


/**
 * OnClientData
 * Client -> Server
 */
Proxy.prototype.clientData = function OnServerData(data) {
	if (!this._tcp || this._tcp.destroyed) { // FIX: Kiểm tra xem TCP socket có bị hủy chưa
		// wth ? Not initialized yet ?
		return;
	}

	try {
		this._tcp.write(data);
	}
	catch(e) {
        mes.error("Lỗi khi ghi dữ liệu vào TCP socket: %s", e.message);
    }
}


/**
 * OnServerData
 * Server -> Client
 */
Proxy.prototype.serverData = function OnClientData(data) {
    // FIX: Kiểm tra trạng thái của WebSocket trước khi gửi
	if (this._ws && this._ws.readyState === 1) { // 1 = OPEN
		this._ws.send(data, function(error){
			if (error) {
				mes.error("Lỗi khi gửi dữ liệu qua WebSocket: %s", error.message);
			}
		});
	}
}


/**
 * OnClose
 * Clean up events/sockets
 */
Proxy.prototype.close = function OnClose() {
	if (this._tcp) {
		// mes.info("Connection closed from '%s'.", this._to);
		this._tcp.removeAllListeners(); // FIX: Dọn dẹp tất cả các listener một cách an toàn
		this._tcp.end();
		this._tcp.destroy(); // Đảm bảo socket được hủy hoàn toàn
	}

	if (this._ws) {
		// mes.info("Connection closed from '%s'.", this._from);
		this._ws.removeAllListeners(); // FIX: Dọn dẹp tất cả các listener
		this._ws.close();
	}

    // FIX: Gán null để giải phóng bộ nhớ và tránh các lệnh gọi không mong muốn
    this._tcp = null;
    this._ws = null;
}


/**
 * On server accepts connection
 */
Proxy.prototype.connectAccept = function OnConnectAccept() {
	mes.status("Connection accepted from '%s'.", this._to);
}

/**
 * Exports
 */
module.exports = Proxy;
