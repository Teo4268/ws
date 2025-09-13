/**
 * Dependencies
 */
const net = require("net");
const mes = require("./message");

/**
 * Constructor
 */
function Proxy(ws) {
  const to = ws.upgradeReq.url.substr(1);
  this._tcp = null;
  this._from = ws.upgradeReq.connection.remoteAddress;
  this._to = Buffer.from(to, "base64").toString();
  this._ws = ws;

  // Parse host:port
  const args = this._to.split(":");
  const host = args[0];
  const port = parseInt(args[1], 10);

  // Bind handlers (để removeListener hoạt động đúng)
  this._onClientData = this.clientData.bind(this);
  this._onClose = this.close.bind(this);
  this._onError = (error) => console.log(error);
  this._onServerData = this.serverData.bind(this);
  this._onServerError = (error) => console.log(error);
  this._onConnectAccept = this.connectAccept.bind(this);

  // Bind websocket events
  this._ws.on("message", this._onClientData);
  this._ws.on("close", this._onClose);
  this._ws.on("error", this._onError);

  // Initialize proxy
  mes.info(
    "Requested connection from '%s' to '%s' [ACCEPTED].",
    this._from,
    this._to
  );

  // Connect to TCP server
  this._tcp = net.connect({ host, port });

  // Disable nagle algorithm
  this._tcp.setTimeout(0);
  this._tcp.setNoDelay(true);

  // Bind TCP events
  this._tcp.on("data", this._onServerData);
  this._tcp.on("close", this._onClose);
  this._tcp.on("error", this._onServerError);
  this._tcp.on("connect", this._onConnectAccept);
}

/**
 * OnClientData
 * Client -> Server
 */
Proxy.prototype.clientData = function (data) {
  if (!this._tcp) return;
  try {
    this._tcp.write(data);
  } catch (e) {}
};

/**
 * OnServerData
 * Server -> Client
 */
Proxy.prototype.serverData = function (data) {
  this._ws.send(data.toString(), function (error) {
    // nếu cần xử lý error thì mở ra
  });
};

/**
 * OnClose
 * Clean up events/sockets
 */
Proxy.prototype.close = function () {
  if (this._tcp) {
    this._tcp.removeListener("close", this._onClose);
    this._tcp.removeListener("error", this._onServerError);
    this._tcp.removeListener("data", this._onServerData);
    this._tcp.removeListener("connect", this._onConnectAccept);
    this._tcp.end();
    this._tcp = null;
  }

  if (this._ws) {
    this._ws.removeListener("close", this._onClose);
    this._ws.removeListener("error", this._onError);
    this._ws.removeListener("message", this._onClientData);
    this._ws.close();
    this._ws = null;
  }
};

/**
 * On server accepts connection
 */
Proxy.prototype.connectAccept = function () {
  mes.status("Connection accepted from '%s'.", this._to);
};

/**
 * Exports
 */
module.exports = Proxy;
