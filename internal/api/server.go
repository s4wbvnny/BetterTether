package api

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

type RelayStats struct {
	Connected   bool   `json:"connected"`
	SentBytes   uint64 `json:"sentBytes"`
	RecvBytes   uint64 `json:"recvBytes"`
	ConnectedAt string `json:"connectedAt,omitempty"`
	ClientIP    string `json:"clientIP,omitempty"`
	GatewayIP   string `json:"gatewayIP,omitempty"`
	PhoneMAC    string `json:"phoneMAC,omitempty"`
}

type DaemonStatus struct {
	Running  bool        `json:"running"`
	Active   bool        `json:"active"`
	Relay    *RelayStats `json:"relay,omitempty"`
	Uptime   string      `json:"uptime,omitempty"`
}

type StatusProvider interface {
	Status() DaemonStatus
	StartDaemon() error
	StopDaemon() error
}

type Server struct {
	host    string
	port    int
	server  *http.Server
	status  StatusProvider
	startMu sync.Mutex
}

func New(host string, port int, provider StatusProvider) *Server {
	s := &Server{
		host:   host,
		port:   port,
		status: provider,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/daemon/start", s.handleStart)
	mux.HandleFunc("/api/daemon/stop", s.handleStop)
	s.server = &http.Server{
		Handler:     corsMiddleware(mux),
		ReadTimeout: 10 * time.Second,
	}
	return s
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) Start() error {
	s.startMu.Lock()
	defer s.startMu.Unlock()

	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("api: failed to listen on %s: %w", addr, err)
	}

	log.Info().Str("addr", addr).Msg("API server started")
	go func() {
		if err := s.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Error().Err(err).Msg("API server error")
		}
	}()
	return nil
}

func (s *Server) Stop() error {
	s.startMu.Lock()
	defer s.startMu.Unlock()
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	status := s.status.Status()
	writeJSON(w, http.StatusOK, status)
}

func (s *Server) handleStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := s.status.StartDaemon(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "started"})
}

func (s *Server) handleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := s.status.StopDaemon(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
