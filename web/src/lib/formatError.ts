export function formatGlError(e: any): string {
    if (!e) return "Unknown Error";
    if (typeof e === "string") return e;
    
    // If it's a viem RPC error with a message
    if (e.message) {
        const fullMsg = String(e.message);
        if (fullMsg.includes("AllocationLifecycleBudgetInsufficient")) {
            const match = fullMsg.match(/AllocationLifecycleBudgetInsufficient[^\n]*/);
            if (match) return match[0];
        }
        if (fullMsg.includes("UserError")) {
            const match = fullMsg.match(/UserError[^\n]*/);
            if (match) return match[0];
        }
        
        let msg = fullMsg.split("\n")[0];
        if (msg.includes("An internal error was received")) {
            msg = e.details || e.shortMessage || msg;
        }
        
        // If it's a transaction result object that had an error
        if (e.tx) {
            let rawError = e.tx.raw_error || e.tx.execution_result?.raw_error;
            let stderr = e.tx.stderr || e.tx.execution_result?.stderr;
            
            if (!rawError && e.tx.consensus_data?.leader_receipt?.[0]?.execution_data?.genvm_result) {
                const gr = e.tx.consensus_data.leader_receipt[0].execution_data.genvm_result;
                rawError = gr.raw_error;
                stderr = gr.stderr;
            }

            const payload = e.tx.consensus_data?.leader_receipt?.[0]?.result?.payload;
            if (payload && typeof payload === "string") {
                return `Transaction failed: ${payload}`;
            }

            if (rawError) return `Transaction failed: ${rawError}`;
            if (stderr) return `Transaction failed: ${stderr}`;
            
            if (e.tx.txExecutionResultName === "FINISHED_WITH_ERROR" || e.tx.status === "FINISHED_WITH_ERROR" || e.tx.execution_result === "FINISHED_WITH_ERROR") {
                return `Transaction failed (Unknown). Please check the explorer for raw_error or stderr traces.`;
            }
        }
        
        return msg;
    }
    
    // If it's the tx object directly
    if (e.status === "FINISHED_WITH_ERROR" || e.execution_result === "FINISHED_WITH_ERROR") {
        const rawError = e.raw_error || e.execution_result?.raw_error;
        const stderr = e.stderr || e.execution_result?.stderr;
        if (rawError) return `Transaction failed: ${rawError}`;
        if (stderr) return `Transaction failed: ${stderr}`;
        return `Transaction failed (Unknown). Please check the explorer for raw_error or stderr traces.`;
    }
    
    return "Unknown error. Check explorer.";
}
