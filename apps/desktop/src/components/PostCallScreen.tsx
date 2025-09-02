import { useState } from 'react';
import { Button } from '@oatmeal/ui';
import { Download, Send, Copy, X } from 'lucide-react';

interface PostCallScreenProps {
  transcript: string;
  onClose: () => void;
}

export default function PostCallScreen({ onClose }: PostCallScreenProps) {
  const [summary] = useState('# Executive Summary\n\nMeeting completed. Processing summary...');
  const [email, setEmail] = useState({
    subject: 'Follow-up from our call',
    body: 'Thanks for the call today...'
  });

  const handlePushToHubspot = () => {
    console.log('Pushing to HubSpot...');
  };

  const handleCreateGmailDraft = () => {
    console.log('Creating Gmail draft...');
  };

  const handleExportZip = () => {
    console.log('Exporting session as ZIP...');
  };

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(email.body);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Call Summary</h1>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Executive Summary</h2>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm">{summary}</pre>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={handleCopyEmail}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <Button size="sm" onClick={handleExportZip}>
                  <Download className="w-4 h-4 mr-2" />
                  Export ZIP
                </Button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Actions</h2>
              <div className="space-y-3">
                <Button 
                  onClick={handlePushToHubspot}
                  className="w-full justify-start"
                  variant="outline"
                >
                  Push to HubSpot
                </Button>
                <Button 
                  onClick={handleCreateGmailDraft}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Create Gmail Draft
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Follow-up Email</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Subject</label>
                <input
                  type="text"
                  value={email.subject}
                  onChange={(e) => setEmail(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Body</label>
                <textarea
                  value={email.body}
                  onChange={(e) => setEmail(prev => ({ ...prev, body: e.target.value }))}
                  className="w-full h-64 px-3 py-2 border border-border rounded-md bg-background resize-none"
                />
              </div>
              <Button onClick={handleCopyEmail} className="w-full">
                <Copy className="w-4 h-4 mr-2" />
                Copy Email
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}