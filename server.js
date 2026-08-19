const express = require("express");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  maxPayload: 20 * 1024 * 1024
});

// code -> { pc, mobile }
const rooms = new Map();

app.get("/", (req, res) => {
  res.send("Passport relay test funcionando");
});

function enviar(socket, data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

wss.on("connection", (socket) => {

  socket.role = null;
  socket.code = null;

  socket.on("message", raw => {

    try {
      const mensaje = JSON.parse(raw.toString());

      // =========================
      // REGISTRAR PC
      // =========================

      if (mensaje.type === "register-pc") {

        const code = String(mensaje.code || "").trim();

        if (!code) {
          enviar(socket, {
            type: "error",
            message: "Código vacío"
          });
          return;
        }

        let room = rooms.get(code);

        if (!room) {
          room = {
            pc: null,
            mobile: null
          };

          rooms.set(code, room);
        }

        room.pc = socket;

        socket.role = "pc";
        socket.code = code;

        enviar(socket, {
          type: "pc-registered",
          code
        });

        return;
      }


      // =========================
      // CONECTAR IPHONE
      // =========================

      if (mensaje.type === "join") {

        const code = String(mensaje.code || "").trim();

        const room = rooms.get(code);

        if (
          !room ||
          !room.pc ||
          room.pc.readyState !== WebSocket.OPEN
        ) {

          enviar(socket, {
            type: "error",
            message: "PC no disponible"
          });

          return;
        }

        room.mobile = socket;

        socket.role = "mobile";
        socket.code = code;

        enviar(socket, {
          type: "joined"
        });

        enviar(room.pc, {
          type: "mobile-connected"
        });

        return;
      }


      // =========================
      // IPHONE ENVÍA ARCHIVO
      // =========================

      if (mensaje.type === "file") {

        const code = socket.code;

        const room = rooms.get(code);

        if (
          socket.role !== "mobile" ||
          !room ||
          !room.pc
        ) {

          enviar(socket, {
            type: "error",
            message: "PC no conectado"
          });

          return;
        }

        enviar(room.pc, {
          type: "file",
          name: mensaje.name,
          mime: mensaje.mime,
          data: mensaje.data
        });

        return;
      }


      // =========================
      // PC CONFIRMA GUARDADO
      // =========================

      if (mensaje.type === "confirm") {

        const room = rooms.get(socket.code);

        if (
          socket.role === "pc" &&
          room &&
          room.mobile
        ) {

          enviar(room.mobile, {
            type: "confirm"
          });

        }

        return;
      }

    }

    catch (error) {

      console.error("Error mensaje:", error);

      enviar(socket, {
        type: "error",
        message: "Mensaje no válido"
      });

    }

  });


  socket.on("close", () => {

    const code = socket.code;

    if (!code) return;

    const room = rooms.get(code);

    if (!room) return;


    if (socket.role === "pc") {

      room.pc = null;

      if (room.mobile) {

        enviar(room.mobile, {
          type: "pc-disconnected"
        });

      }

    }


    if (socket.role === "mobile") {

      room.mobile = null;

      if (room.pc) {

        enviar(room.pc, {
          type: "mobile-disconnected"
        });

      }

    }


    if (!room.pc && !room.mobile) {
      rooms.delete(code);
    }

  });

});


const PORT =
  process.env.PORT || 3000;

server.listen(PORT, () => {

  console.log(
    `Relay funcionando en puerto ${PORT}`
  );

});
