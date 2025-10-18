import { useState } from 'react';
import { RetroButton, InfoPanel } from '../terminal';
import { escrowClient } from '../../lib/escrow-client';

interface DisputeModalProps {
  escrowId: number;
  userAddress: string;
  onClose: () => void;
  onDisputeOpened: () => void;
}

/**
 * DisputeModal Component
 * Modal for opening disputes on escrow contracts with evidence upload
 */
export const DisputeModal = ({
  escrowId,
  userAddress,
  onClose,
  onDisputeOpened,
}: DisputeModalProps) => {
  const [reason, setReason] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setEvidenceFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      alert('Please provide a reason for the dispute');
      return;
    }

    if (reason.length < 20) {
      alert('Please provide a more detailed reason (minimum 20 characters)');
      return;
    }

    setSubmitting(true);

    try {
      // Upload evidence to IPFS (placeholder - would integrate with IPFS in production)
      const evidenceUrls: string[] = [];
      for (const file of evidenceFiles) {
        // In production, upload to IPFS:
        // const url = await uploadToIPFS(file);
        // evidenceUrls.push(url);

        // For now, just log the file name
        console.log(`Evidence file to upload: ${file.name} (${file.size} bytes)`);
      }

      // Open dispute via API
      const result = await escrowClient.disputeEscrow(escrowId, userAddress, reason);

      // In production, submit evidence to dispute system:
      // for (const url of evidenceUrls) {
      //   await submitEvidence(result.dispute_id, url);
      // }

      alert(
        `Dispute #${result.dispute_id} opened successfully!\n\n` +
        `Status: ${result.status}\n` +
        `Arbitrators will review your case within 3 business days.\n` +
        `Both parties have 7 days to submit additional evidence.`
      );

      onDisputeOpened();
      onClose();
    } catch (error) {
      console.error('Failed to open dispute:', error);
      alert(
        `Failed to open dispute:\n${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
        `Please try again or contact support if the issue persists.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-cream-200 border-4 border-cream-600 p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-mono text-xl font-bold text-text-primary">OPEN DISPUTE</h2>
          <button
            onClick={onClose}
            className="text-3xl font-bold hover:text-terminal-red transition-colors"
            disabled={submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Reason Input */}
          <div>
            <label className="block font-mono text-sm font-semibold mb-2 text-text-secondary">
              Reason for Dispute <span className="text-terminal-red">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border-3 border-cream-600 bg-cream-100 p-3 font-mono text-sm min-h-[120px] focus:border-copper-500 focus:outline-none"
              placeholder="Describe the issue in detail... (minimum 20 characters)"
              disabled={submitting}
              maxLength={2000}
            />
            <div className="text-xs text-text-tertiary font-mono mt-1">
              {reason.length}/2000 characters
            </div>
          </div>

          {/* Evidence Upload */}
          <div>
            <label className="block font-mono text-sm font-semibold mb-2 text-text-secondary">
              Evidence (Optional)
            </label>
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="font-mono text-sm w-full"
              disabled={submitting}
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.mp4,.mov"
            />
            <p className="text-xs text-text-tertiary font-mono mt-1">
              Supported: Documents, images, videos, chat logs (max 10MB per file)
            </p>
          </div>

          {/* Evidence Files List */}
          {evidenceFiles.length > 0 && (
            <div className="border-3 border-cream-600 p-3">
              <p className="font-mono text-sm font-semibold mb-2 text-text-secondary">
                Files to Upload: {evidenceFiles.length}
              </p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {evidenceFiles.map((file, idx) => (
                  <li key={idx} className="font-mono text-xs text-text-tertiary flex justify-between">
                    <span className="truncate">{file.name}</span>
                    <span className="ml-2 flex-shrink-0">({formatFileSize(file.size)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warning Info */}
          <div className="border-3 border-copper-500 bg-copper-500/10 p-3">
            <p className="font-mono text-sm text-copper-600 font-semibold mb-2">
              ⚠️ Warning: Opening a dispute will:
            </p>
            <ul className="font-mono text-xs text-text-secondary mt-2 ml-4 list-disc space-y-1">
              <li>Freeze the escrow contract immediately</li>
              <li>Assign a random arbiter from the pool to review the case</li>
              <li>Give both parties 7 days to submit evidence and counter-arguments</li>
              <li>Arbiter will make a binding decision within 3 days after evidence period</li>
              <li>Frivolous disputes may be penalized (5% of escrow amount slashing)</li>
              <li>Arbiter decisions are final and cannot be appealed</li>
            </ul>
          </div>

          {/* Dispute Process Timeline */}
          <InfoPanel variant="info">
            <div className="font-mono text-xs">
              <div className="font-semibold mb-2">DISPUTE RESOLUTION TIMELINE:</div>
              <div className="space-y-1">
                <div>Day 0: Dispute opened, escrow frozen</div>
                <div>Day 0-7: Evidence submission period</div>
                <div>Day 7-10: Arbiter review and decision</div>
                <div>Day 10: Final ruling executed on-chain</div>
              </div>
            </div>
          </InfoPanel>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <RetroButton
              onClick={handleSubmit}
              variant="primary"
              disabled={submitting || !reason.trim() || reason.length < 20}
              className="flex-1"
            >
              {submitting ? 'SUBMITTING...' : 'OPEN DISPUTE'}
            </RetroButton>
            <RetroButton
              onClick={onClose}
              variant="secondary"
              disabled={submitting}
              className="flex-1"
            >
              CANCEL
            </RetroButton>
          </div>

          {/* Additional Help */}
          <div className="text-xs text-text-tertiary font-mono text-center">
            Need help? Contact support at support@tonsurance.com
          </div>
        </div>
      </div>
    </div>
  );
};
