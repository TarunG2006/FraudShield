const { Server } = require('socket.io');

let io = null;

/**
 * Initialize Socket.io with the HTTP server.
 * Call this once from server.js after the server is created.
 * @param {http.Server} server
 */
function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket.io] Initialized and listening for connections.');
  return io;
}

/**
 * Return the active Socket.io instance.
 * Throws if initSocket() has not been called yet.
 */
function getIO() {
  if (!io) {
    throw new Error('[Socket.io] Not initialized. Call initSocket(server) first.');
  }
  return io;
}

module.exports = { initSocket, getIO };