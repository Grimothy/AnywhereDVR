import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

// Singleton socket — created once, shared across all hook consumers
let _socket: Socket | null = null

function getSocket(): Socket {
  if (!_socket) {
    _socket = io('/', { path: '/socket.io' })
  }
  return _socket
}

export function useSocket(): Socket {
  const [, forceRender] = useState(0)
  const socketRef = useRef<Socket>(getSocket())

  useEffect(() => {
    const socket = getSocket()
    socketRef.current = socket

    if (!socket.connected) {
      // Force a re-render once connected so consumers see a live socket
      const onConnect = () => forceRender((n) => n + 1)
      socket.once('connect', onConnect)
      return () => {
        socket.off('connect', onConnect)
      }
    }
  }, [])

  return socketRef.current
}

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
) {
  const socket = useSocket()
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const stable = (data: T) => handlerRef.current(data)
    socket.on(event, stable)
    return () => {
      socket.off(event, stable)
    }
  }, [socket, event])
}
