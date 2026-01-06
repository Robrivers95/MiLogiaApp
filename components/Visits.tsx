
import React, { useEffect, useState } from 'react';
import { User, VisitRequest, Group } from '../types';
import { dataService } from '../services/api';

interface Props {
  user: User;
}

const Visits: React.FC<Props> = ({ user }) => {
  const [visitRequests, setVisitRequests] = useState<VisitRequest[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingRequest, setViewingRequest] = useState<VisitRequest | null>(null);
  
  // Form states
  const [newVisitToGroupId, setNewVisitToGroupId] = useState('');
  const [newVisitDate, setNewVisitDate] = useState('');
  const [newVisitCount, setNewVisitCount] = useState(1);
  const [newVisitMessage, setNewVisitMessage] = useState('');
  const [newChatMessage, setNewChatMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const [message, setMessage] = useState<{text: string, type: 'success' | 'error'} | null>(null);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({text, type});
    setTimeout(() => setMessage(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, [user.groupId]);

  const loadData = async () => {
    if (!user.groupId) return;
    setLoading(true);
    try {
      const [requests, groups] = await Promise.all([
        dataService.getVisitRequestsForGroup(user.groupId),
        dataService.getAllGroups()
      ]);
      setVisitRequests(requests);
      setAllGroups(groups.filter(g => g.id !== user.groupId)); // Exclude own group
    } catch (e) {
      console.error("Error loading data", e);
      showMessage("Error cargando datos", 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async () => {
    if (!newVisitToGroupId || !newVisitDate || newVisitCount < 1 || !newVisitMessage.trim()) {
      showMessage("Completa todos los campos", 'error');
      return;
    }
    
    if (!user.groupId) {
      showMessage("Error: No tienes una logia asignada", 'error');
      return;
    }
    
    setSubmitting(true);
    try {
      const currentGroup = await dataService.getGroupDetails(user.groupId);
      const targetGroup = allGroups.find(g => g.id === newVisitToGroupId);
      
      if (!currentGroup) {
        showMessage("Error: No se pudo obtener info de tu logia", 'error');
        return;
      }
      
      if (!targetGroup) {
        showMessage("Error: Logia destino no encontrada", 'error');
        return;
      }

      await dataService.createVisitRequest({
        fromGroupId: user.groupId,
        fromGroupName: currentGroup.name,
        toGroupId: newVisitToGroupId,
        toGroupName: targetGroup.name,
        requestedBy: user.uid,
        requestedByName: user.name,
        visitDate: newVisitDate,
        numberOfVisitors: newVisitCount,
        message: newVisitMessage,
        status: 'pending'
      });

      showMessage("Solicitud de visita enviada");
      setNewVisitToGroupId('');
      setNewVisitDate('');
      setNewVisitCount(1);
      setNewVisitMessage('');
      await loadData();
    } catch (e) {
      console.error("Error creating visit request:", e);
      showMessage("Error creando solicitud", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!viewingRequest || !newChatMessage.trim()) return;
    
    setSubmitting(true);
    try {
      await dataService.addMessageToVisitRequest(viewingRequest.id, {
        senderUid: user.uid,
        senderName: user.name,
        text: newChatMessage.trim()
      });
      
      // Reload the specific request
      const updated = await dataService.getVisitRequestsForGroup(user.groupId);
      const updatedRequest = updated.find(r => r.id === viewingRequest.id);
      if (updatedRequest) {
        setViewingRequest(updatedRequest);
      }
      setVisitRequests(updated);
      setNewChatMessage('');
      showMessage("Mensaje enviado");
    } catch (e) {
      console.error("Error sending message:", e);
      showMessage("Error enviando mensaje", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!confirm("¿Seguro que quieres cancelar esta solicitud?")) return;
    
    try {
      await dataService.deleteVisitRequest(requestId);
      showMessage("Solicitud cancelada");
      await loadData();
      if (viewingRequest?.id === requestId) {
        setViewingRequest(null);
      }
    } catch (e) {
      console.error("Error:", e);
      showMessage("Error cancelando solicitud", 'error');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Cargando...</div>;
  }

  // View single request detail
  if (viewingRequest) {
    const isFromOurGroup = viewingRequest.fromGroupId === user.groupId;
    const isAdmin = user.role === 'admin' || user.role === 'master';
    
    return (
      <div className="p-4 space-y-4 pb-24">
        <button
          onClick={() => setViewingRequest(null)}
          className="text-indigo-400 hover:text-indigo-300 text-sm mb-2"
        >
          ← Volver a solicitudes
        </button>

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'}`}>
            {message.text}
          </div>
        )}

        <div className="bg-logia-800 rounded-xl p-5 border border-logia-700">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-bold text-white">
                {isFromOurGroup ? `Visita a ${viewingRequest.toGroupName}` : `Visita de ${viewingRequest.fromGroupName}`}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Solicitado por: {viewingRequest.requestedByName}
              </p>
            </div>
            <span className={`px-3 py-1 rounded text-xs font-bold ${
              viewingRequest.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
              viewingRequest.status === 'accepted' ? 'bg-green-900/30 text-green-400' :
              viewingRequest.status === 'rejected' ? 'bg-red-900/30 text-red-400' :
              'bg-blue-900/30 text-blue-400'
            }`}>
              {viewingRequest.status === 'pending' ? 'Pendiente' :
               viewingRequest.status === 'accepted' ? 'Aceptada' :
               viewingRequest.status === 'rejected' ? 'Rechazada' :
               'Completada'}
            </span>
          </div>

          <div className="space-y-2 text-sm mb-4">
            <p className="text-gray-300"><strong>Fecha:</strong> {viewingRequest.visitDate}</p>
            <p className="text-gray-300"><strong>Visitantes:</strong> {viewingRequest.numberOfVisitors}</p>
            <p className="text-gray-300"><strong>Mensaje inicial:</strong></p>
            <p className="text-gray-400 italic bg-logia-900 p-3 rounded">"{viewingRequest.message}"</p>
          </div>

          {/* Chat */}
          <div className="border-t border-logia-700 pt-4">
            <h4 className="text-sm font-bold text-white mb-3">Mensajes</h4>
            <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
              {viewingRequest.messages && viewingRequest.messages.length > 0 ? (
                viewingRequest.messages.map((msg) => (
                  <div key={msg.id} className={`p-3 rounded-lg ${msg.senderUid === user.uid ? 'bg-indigo-900/30 ml-4' : 'bg-logia-900 mr-4'}`}>
                    <p className="text-xs text-gray-400 mb-1">{msg.senderName} • {new Date(msg.timestamp).toLocaleString('es-MX', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</p>
                    <p className="text-sm text-gray-200">{msg.text}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 text-center">No hay mensajes aún</p>
              )}
            </div>

            {/* Send message */}
            {viewingRequest.status !== 'rejected' && viewingRequest.status !== 'completed' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newChatMessage}
                  onChange={(e) => setNewChatMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-logia-900 border border-logia-700 rounded-lg px-3 py-2 text-sm text-white"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newChatMessage.trim() || submitting}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Enviar
                </button>
              </div>
            )}
          </div>

          {/* Cancel button (only for creator and if pending) */}
          {isFromOurGroup && viewingRequest.status === 'pending' && (
            <button
              onClick={() => handleCancelRequest(viewingRequest.id)}
              className="w-full mt-4 bg-red-900/30 hover:bg-red-900/50 text-red-400 py-2 rounded-lg text-sm font-medium"
            >
              Cancelar Solicitud
            </button>
          )}
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="p-4 space-y-6 pb-24">
      <h2 className="text-2xl font-bold text-white">Visitas entre Logias</h2>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'error' ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'}`}>
          {message.text}
        </div>
      )}

      {/* Create new request */}
      <div className="bg-logia-800 rounded-xl p-5 border border-logia-700">
        <h3 className="text-md font-bold text-white mb-4">Solicitar Visita a otra Logia</h3>
        
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 uppercase block mb-1">Logia a Visitar</label>
            <select
              value={newVisitToGroupId}
              onChange={(e) => setNewVisitToGroupId(e.target.value)}
              className="w-full bg-logia-900 border border-logia-700 rounded-lg p-2 text-white"
            >
              <option value="">Selecciona...</option>
              {allGroups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase block mb-1">Fecha de Visita</label>
              <input
                type="date"
                value={newVisitDate}
                onChange={(e) => setNewVisitDate(e.target.value)}
                className="w-full bg-logia-900 border border-logia-700 rounded-lg p-2 text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase block mb-1">Visitantes</label>
              <input
                type="number"
                value={newVisitCount}
                onChange={(e) => setNewVisitCount(Number(e.target.value))}
                min="1"
                className="w-full bg-logia-900 border border-logia-700 rounded-lg p-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase block mb-1">Mensaje</label>
            <textarea
              value={newVisitMessage}
              onChange={(e) => setNewVisitMessage(e.target.value)}
              placeholder="Motivo de la visita, saludos..."
              className="w-full bg-logia-900 border border-logia-700 rounded-lg p-2 text-white resize-none"
              rows={3}
            />
          </div>

          <button
            onClick={handleCreateRequest}
            disabled={submitting}
            className="w-full bg-logia-accent hover:bg-logia-accentHover disabled:bg-gray-700 text-white font-bold py-2 rounded-lg"
          >
            {submitting ? 'Enviando...' : 'Enviar Solicitud'}
          </button>
        </div>
      </div>

      {/* List of requests */}
      <div>
        <h3 className="text-lg font-bold text-white mb-3">Mis Solicitudes</h3>
        {visitRequests.length === 0 ? (
          <div className="bg-logia-800 p-6 rounded-xl text-center text-gray-400 border border-logia-700">
            No hay solicitudes de visita
          </div>
        ) : (
          <div className="space-y-3">
            {visitRequests.map(req => {
              const isFromOurGroup = req.fromGroupId === user.groupId;
              return (
                <div
                  key={req.id}
                  onClick={() => setViewingRequest(req)}
                  className="bg-logia-800 rounded-lg p-4 border border-logia-700 cursor-pointer hover:bg-logia-700 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-white font-medium">
                        {isFromOurGroup ? `→ ${req.toGroupName}` : `← ${req.fromGroupName}`}
                      </h4>
                      <p className="text-xs text-gray-400 mt-1">
                        Por: {req.requestedByName} • {req.visitDate}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      req.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
                      req.status === 'accepted' ? 'bg-green-900/30 text-green-400' :
                      req.status === 'rejected' ? 'bg-red-900/30 text-red-400' :
                      'bg-blue-900/30 text-blue-400'
                    }`}>
                      {req.status === 'pending' ? 'Pendiente' :
                       req.status === 'accepted' ? 'Aceptada' :
                       req.status === 'rejected' ? 'Rechazada' :
                       'Completada'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 truncate">{req.message}</p>
                  {req.messages && req.messages.length > 0 && (
                    <p className="text-xs text-indigo-400 mt-2">💬 {req.messages.length} mensaje(s)</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Visits;
