import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  
  useEffect(() => {
    socketRef.current = io('/', { path: '/socket.io' })
    
    return () => {
      socketRef.current?.disconnect()
    }
  }, [])
  
  return socketRef.current
}

export function useSocketEvent(event: string, handler: (data: any) => void) {
  const socket = useSocket()
  
  useEffect(() => {
    if (!socket) return
    
    socket.on(event, handler)
    
    return () => {
      socket.off(event, handler)
    }
  }, [socket, event, handler])
}