/**
 * Escrow API Client
 * TypeScript client for all escrow backend endpoints
 */

export interface ReleaseCondition {
  type: 'oracle' | 'time_elapsed' | 'manual_approval' | 'chain_event' | 'multisig';
  // Oracle fields
  oracle_endpoint?: string;
  expected_value?: string;
  verified?: boolean;
  last_check?: number;
  // Time elapsed fields
  seconds?: number;
  start_time?: number;
  // Manual approval fields
  approver?: string;
  approved?: boolean;
  approval_deadline?: number;
  signature?: string;
  // Chain event fields
  chain?: string;
  event_type?: string;
  contract_address?: string;
  occurred?: boolean;
  verified_at?: number;
  // Multisig fields
  required_signatures?: number;
  signers?: string[];
  signatures_received?: Array<[string, string]>;
}

export interface CreateEscrowRequest {
  payer_address: string;
  payee_address: string;
  amount_usd: number;
  asset: string;
  escrow_type: 'freelance' | 'tradefin' | 'milestone' | 'real_estate' | 'multi_party';
  conditions: ReleaseCondition[];
  duration_days: number;
  timeout_action: 'release_to_payee' | 'return_to_payer' | { split: number };
  protection_enabled: boolean;
  additional_parties?: Array<{ party_address: string; allocation_percentage: number }>;
}

export interface EscrowContract {
  escrow_id: number;
  payer: string;
  payee: string;
  amount: number; // USD cents
  asset: string;
  created_at: number;
  release_conditions: ReleaseCondition[];
  timeout_action: string | { split: number };
  timeout_seconds: number;
  additional_parties: Array<{ party_address: string; allocation_percentage: number }>;
  status: 'active' | 'conditions_met' | 'released' | 'disputed' | 'cancelled' | 'timed_out';
  conditions_met: number;
  released_at?: number;
  protection_enabled: boolean;
  coverage_type?: 'smart_contract' | 'timeout' | 'comprehensive' | null;
  coverage_premium?: number;
  escrow_type: string;
  contract_address?: string;
}

export interface CreateEscrowResponse {
  escrow_id: number;
  payer: string;
  payee: string;
  amount_usd: number;
  status: string;
  contract_address: string;
  policy_id?: number;
}

export interface GetEscrowResponse {
  escrow: EscrowContract;
}

export interface GetUserEscrowsResponse {
  escrows: EscrowContract[];
  count: number;
}

export interface ApproveEscrowResponse {
  success: boolean;
  message: string;
}

export interface SignEscrowResponse {
  success: boolean;
  signatures_count: number;
  threshold: number;
}

export interface CancelEscrowResponse {
  success: boolean;
  status: string;
}

export interface DisputeEscrowResponse {
  success: boolean;
  dispute_id: number;
  status: string;
}

export interface EscrowStatusResponse {
  escrow: EscrowContract;
  conditions_status: Array<{ index: number; met: boolean; description: string }>;
  time_remaining_seconds: number;
  can_release: boolean;
}

export interface WebSocketMessage {
  type: 'subscribe' | 'escrow_update' | 'error';
  escrow_id?: number;
  escrow?: EscrowContract;
  message?: string;
}

/**
 * Escrow API Client
 * Provides methods to interact with the escrow backend API
 */
export class EscrowClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws?: WebSocket;

  constructor(baseUrl = 'http://localhost:8080', wsUrl = 'ws://localhost:8081') {
    this.baseUrl = baseUrl;
    this.wsUrl = wsUrl;
  }

  /**
   * Create a new escrow contract
   */
  async createEscrow(request: CreateEscrowRequest): Promise<CreateEscrowResponse> {
    const response = await fetch(`${this.baseUrl}/escrow/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create escrow: ${error}`);
    }

    return response.json();
  }

  /**
   * Get escrow details by ID
   */
  async getEscrow(escrowId: number): Promise<EscrowContract> {
    const response = await fetch(`${this.baseUrl}/escrow/${escrowId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch escrow: ${response.statusText}`);
    }

    const data: GetEscrowResponse = await response.json();
    return data.escrow;
  }

  /**
   * Get all escrows for a user (as payer or payee)
   */
  async getUserEscrows(userAddress: string): Promise<GetUserEscrowsResponse> {
    const response = await fetch(`${this.baseUrl}/escrow/user/${encodeURIComponent(userAddress)}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch user escrows: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Submit approval for manual approval condition
   */
  async approveEscrow(
    escrowId: number,
    approverAddress: string,
    signature: string
  ): Promise<ApproveEscrowResponse> {
    const response = await fetch(`${this.baseUrl}/escrow/${escrowId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approver_address: approverAddress,
        signature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to approve escrow: ${error}`);
    }

    return response.json();
  }

  /**
   * Submit signature for multisig condition
   */
  async signEscrow(
    escrowId: number,
    signerAddress: string,
    signature: string
  ): Promise<SignEscrowResponse> {
    const response = await fetch(`${this.baseUrl}/escrow/${escrowId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signer_address: signerAddress,
        signature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sign escrow: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Cancel an active escrow
   */
  async cancelEscrow(escrowId: number, cancellerAddress: string): Promise<CancelEscrowResponse> {
    const response = await fetch(`${this.baseUrl}/escrow/${escrowId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canceller_address: cancellerAddress,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to cancel escrow: ${error}`);
    }

    return response.json();
  }

  /**
   * Open a dispute for an escrow
   */
  async disputeEscrow(
    escrowId: number,
    disputerAddress: string,
    reason: string
  ): Promise<DisputeEscrowResponse> {
    const response = await fetch(`${this.baseUrl}/escrow/${escrowId}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disputer_address: disputerAddress,
        reason,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to open dispute: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get real-time escrow status with condition evaluation
   */
  async getEscrowStatus(escrowId: number): Promise<EscrowStatusResponse> {
    const response = await fetch(`${this.baseUrl}/escrow/${escrowId}/status`);

    if (!response.ok) {
      throw new Error(`Failed to fetch escrow status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Subscribe to real-time escrow updates via WebSocket
   * @returns Unsubscribe function to close the WebSocket connection
   */
  subscribeToEscrow(escrowId: number, onUpdate: (escrow: EscrowContract) => void): () => void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      const subscribeMsg: WebSocketMessage = {
        type: 'subscribe',
        escrow_id: escrowId,
      };
      this.ws!.send(JSON.stringify(subscribeMsg));
    };

    this.ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        if (data.type === 'escrow_update' && data.escrow_id === escrowId && data.escrow) {
          onUpdate(data.escrow);
        } else if (data.type === 'error') {
          console.error('WebSocket error:', data.message);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    // Return unsubscribe function
    return () => {
      if (this.ws) {
        this.ws.close();
        this.ws = undefined;
      }
    };
  }
}

// Singleton instance
export const escrowClient = new EscrowClient();
