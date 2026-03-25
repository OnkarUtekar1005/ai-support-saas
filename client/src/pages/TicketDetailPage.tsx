import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      api.getTicket(id).then((data) => {
        setTicket(data);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) return <div className="text-gray-500">Loading ticket...</div>;
  if (!ticket) return <div className="text-red-500">Ticket not found</div>;

  const analysis = ticket.analysis as any;

  return (
    <div>
      <button onClick={() => navigate('/tickets')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Tickets
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{ticket.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
              ticket.status === 'RESOLVED' ? 'bg-green-100 text-green-700' :
              ticket.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>{ticket.status.replace(/_/g, ' ')}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
              ticket.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
              ticket.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>{ticket.priority}</span>
            {ticket.confidence && (
              <span className="text-sm text-gray-500">
                Confidence: {Math.round(ticket.confidence * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Description</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* AI Resolution */}
          {ticket.resolution && (
            <div className="card border-green-200 bg-green-50/30">
              <h2 className="text-lg font-semibold text-green-800 mb-3">AI Resolution</h2>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {ticket.resolution}
              </div>
            </div>
          )}

          {/* Chat sessions */}
          {ticket.chatSessions?.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-3">Chat History</h2>
              {ticket.chatSessions.map((session: any) => (
                <div key={session.id} className="space-y-2">
                  {session.messages?.map((msg: any) => (
                    <div key={msg.id} className={msg.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}>
                      {msg.content}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Analysis */}
          {analysis && (
            <div className="card">
              <h3 className="font-semibold text-sm text-gray-900 mb-3">AI Analysis</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Issue Type:</span>
                  <span className="ml-2 font-medium">{analysis.issueType}</span>
                </div>
                <div>
                  <span className="text-gray-500">Summary:</span>
                  <p className="text-gray-700 mt-1">{analysis.summary}</p>
                </div>
                {analysis.entities?.errorMessages?.length > 0 && (
                  <div>
                    <span className="text-gray-500">Errors:</span>
                    <ul className="mt-1 space-y-1">
                      {analysis.entities.errorMessages.map((e: string, i: number) => (
                        <li key={i} className="text-red-600 text-xs font-mono bg-red-50 px-2 py-1 rounded">{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {analysis.entities?.modules?.length > 0 && (
                  <div>
                    <span className="text-gray-500">Modules:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {analysis.entities.modules.map((m: string, i: number) => (
                        <span key={i} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{m}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="card">
            <h3 className="font-semibold text-sm text-gray-900 mb-3">Details</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">Created by:</span> {ticket.createdBy?.name}</div>
              <div><span className="text-gray-500">Created:</span> {new Date(ticket.createdAt).toLocaleString()}</div>
              <div><span className="text-gray-500">Updated:</span> {new Date(ticket.updatedAt).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
