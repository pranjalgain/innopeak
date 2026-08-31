import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true, namespace: '/events' })
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  afterInit(_server: Server): void {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);

    // If the client provides a userId in the handshake query, join their room
    const userId = client.handshake.query['userId'];
    if (typeof userId === 'string' && userId.length > 0) {
      void client.join(`user:${userId}`);
      this.logger.log(`Client ${client.id} joined room user:${userId}`);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Emit an event to a specific user's room.
   */
  emitToUser(userId: string, event: string, data: unknown): void {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Broadcast an event to all connected clients.
   */
  emitToAll(event: string, data: unknown): void {
    this.server.emit(event, data);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string }
  ): { event: string; data: { joined: string } } {
    const room = `user:${payload.userId}`;
    void client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
    return { event: 'joined', data: { joined: room } };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() _client: Socket): { event: string; data: { timestamp: number } } {
    return { event: 'pong', data: { timestamp: Date.now() } };
  }
}
