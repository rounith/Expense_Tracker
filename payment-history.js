// Payment History Tracking Script
// Add this to your existing JavaScript code

// --- Payment History Management ---
let paymentHistory = JSON.parse(localStorage.getItem('paymentHistory') || '[]');

// Tab switching functionality
document.getElementById('debtsTab').addEventListener('click', () => switchTab('debts'));
document.getElementById('historyTab').addEventListener('click', () => switchTab('history'));
document.getElementById('clearHistoryBtn').addEventListener('click', clearPaymentHistory);

function switchTab(tab) {
    const debtsTab = document.getElementById('debtsTab');
    const historyTab = document.getElementById('historyTab');
    const debtsContent = document.getElementById('debtsContent');
    const historyContent = document.getElementById('historyContent');
    
    if (tab === 'debts') {
        debtsTab.classList.add('active');
        historyTab.classList.remove('active');
        debtsContent.classList.remove('hidden');
        historyContent.classList.add('hidden');
    } else {
        historyTab.classList.add('active');
        debtsTab.classList.remove('active');
        historyContent.classList.remove('hidden');
        debtsContent.classList.add('hidden');
        loadPaymentHistory();
    }
}

// Enhanced markDebtAsPaid function with history tracking
async function markDebtAsPaidWithHistory(debtorId, creditorId, amount, billsToSettle) {
    showDebtLoader(true, "Settling debt...");
    try {
        // Original debt settling logic
        for (const bill of billsToSettle) {
            const updatedSettledBy = [...new Set([...bill.settledBy, debtorId])];
            await updateAirtableRecord(AIRTABLE_BILLS_TABLE_NAME, bill.id, { "Settled By": updatedSettledBy });
        }
        
        // Add to payment history
        const settlement = {
            id: Date.now().toString(),
            debtorId: debtorId,
            creditorId: creditorId,
            debtorName: allPeople[debtorId]?.name || 'Unknown',
            creditorName: allPeople[creditorId]?.name || 'Unknown',
            amount: amount,
            settledAt: new Date().toISOString(),
            billIds: billsToSettle.map(bill => bill.id)
        };
        
        paymentHistory.unshift(settlement); // Add to beginning
        localStorage.setItem('paymentHistory', JSON.stringify(paymentHistory));
        
        // Refresh debts and show success
        await loadAndRenderDebts();
        showSettlementSuccess(settlement);
        
    } catch(e) {
        console.error("Failed to mark debt as paid:", e);
        alert("Error settling debt. Please try again.");
    } finally {
        showDebtLoader(false);
    }
}

// Updated renderDebts function to use the new settlement function
function renderDebtsWithHistory(balances) {
    debtsListDiv.innerHTML = '';
    if (balances.length === 0) {
        debtsListDiv.innerHTML = '<p class="text-green-600 text-center">🎉 All settled up!</p>';
        return;
    }

    balances.forEach(debt => {
        const row = document.createElement('div');
        row.className = 'debt-row';
        
        // Show individual bills if there are multiple
        if (debt.bills.length > 1) {
            row.innerHTML = `
                <div class="w-full">
                    <div class="flex justify-between items-center mb-2">
                        <span><b>${debt.from}</b> owes <b>${debt.to}</b>: <span class="font-bold text-blue-600">₹${debt.amount.toFixed(2)}</span></span>
                        <div class="space-x-2">
                            <button onclick="showBillSelectionModal('${debt.fromId}', '${debt.toId}', '${debt.amount}', ${JSON.stringify(debt.bills).replace(/"/g, '&quot;')})" 
                                    class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                                Select Bills
                            </button>
                            <button onclick="markDebtAsPaidWithHistory('${debt.fromId}', '${debt.toId}', ${debt.amount}, ${JSON.stringify(debt.bills).replace(/"/g, '&quot;')})" 
                                    class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm">
                                Settle All
                            </button>
                        </div>
                    </div>
                    <div class="text-xs text-gray-500 ml-4">
                        ${debt.bills.length} bills involved
                    </div>
                </div>
            `;
        } else {
            // Single bill - keep existing simple layout
            row.innerHTML = `<span><b>${debt.from}</b> owes <b>${debt.to}</b>: <span class="font-bold text-blue-600">₹${debt.amount.toFixed(2)}</span></span>`;
            
            const button = document.createElement('button');
            button.textContent = 'Settle Up';
            button.onclick = () => markDebtAsPaidWithHistory(debt.fromId, debt.toId, debt.amount, debt.bills);
            row.appendChild(button);
        }
        
        debtsListDiv.appendChild(row);
    });
}

// Load and display payment history
function loadPaymentHistory() {
    const historyList = document.getElementById('paymentHistoryList');
    const totalSettlements = document.getElementById('totalSettlements');
    const totalAmountSettled = document.getElementById('totalAmountSettled');
    
    if (paymentHistory.length === 0) {
        historyList.innerHTML = '<p class="text-gray-500 text-center">No settlement history yet.</p>';
        totalSettlements.textContent = '0';
        totalAmountSettled.textContent = '₹0.00';
        return;
    }
    
    // Render history items
    historyList.innerHTML = '';
    paymentHistory.forEach(settlement => {
        const item = document.createElement('div');
        item.className = 'payment-history-item';
        
        const date = new Date(settlement.settledAt);
        const formattedDate = date.toLocaleDateString('en-IN', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
        });
        const formattedTime = date.toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        item.innerHTML = `
            <div>
                <div class="font-medium">
                    <span class="text-blue-600">${settlement.debtorName}</span> 
                    paid 
                    <span class="text-green-600">${settlement.creditorName}</span>
                </div>
                <div class="text-sm text-gray-500">${formattedDate} at ${formattedTime}</div>
            </div>
            <div class="text-right">
                <div class="font-bold text-green-600">₹${settlement.amount.toFixed(2)}</div>
                <button onclick="removeFromHistory('${settlement.id}')" 
                        class="text-xs text-red-500 hover:text-red-700 underline">
                    Remove
                </button>
            </div>
        `;
        
        historyList.appendChild(item);
    });
    
    // Update statistics
    const totalAmount = paymentHistory.reduce((sum, settlement) => sum + settlement.amount, 0);
    totalSettlements.textContent = paymentHistory.length;
    totalAmountSettled.textContent = `₹${totalAmount.toFixed(2)}`;
}

// Remove individual settlement from history and restore debt
async function removeFromHistory(settlementId) {
    const settlement = paymentHistory.find(s => s.id === settlementId);
    if (!settlement) return;
    
    const confirmMessage = `Are you sure you want to remove this settlement?\n\n` +
                          `This will restore the debt: ${settlement.debtorName} owes ${settlement.creditorName} ₹${settlement.amount.toFixed(2)}\n\n` +
                          `This action cannot be undone.`;
    
    if (confirm(confirmMessage)) {
        try {
            showDebtLoader(true, "Reversing settlement...");
            
            // Reverse the settlement in Airtable - remove debtor from "Settled By" field
            for (const billId of settlement.billIds) {
                try {
                    // Fetch current bill record
                    const billRecord = await fetchSingleAirtableRecord(AIRTABLE_BILLS_TABLE_NAME, billId);
                    if (billRecord && billRecord.fields['Settled By']) {
                        const currentSettledBy = billRecord.fields['Settled By'] || [];
                        const updatedSettledBy = currentSettledBy.filter(id => id !== settlement.debtorId);
                        
                        // Update the record
                        await updateAirtableRecord(AIRTABLE_BILLS_TABLE_NAME, billId, { 
                            "Settled By": updatedSettledBy 
                        });
                    }
                } catch (billError) {
                    console.warn(`Could not reverse settlement for bill ${billId}:`, billError);
                    // Continue with other bills even if one fails
                }
            }
            
            // Remove from payment history
            paymentHistory = paymentHistory.filter(s => s.id !== settlementId);
            localStorage.setItem('paymentHistory', JSON.stringify(paymentHistory));
            
            // Refresh both history and debts
            loadPaymentHistory();
            await loadAndRenderDebts();
            
            // Show success message
            showReversalSuccess(settlement);
            
        } catch (error) {
            console.error("Failed to reverse settlement:", error);
            alert("Error: Could not reverse the settlement. Please try again or check your connection.");
        } finally {
            showDebtLoader(false);
        }
    }
}

// Clear all payment history and restore all debts
async function clearPaymentHistory() {
    if (paymentHistory.length === 0) {
        alert('No payment history to clear.');
        return;
    }
    
    const confirmMessage = `Are you sure you want to clear ALL payment history?\n\n` +
                          `This will restore ALL settled debts back to outstanding.\n` +
                          `Total settlements to reverse: ${paymentHistory.length}\n\n` +
                          `This action cannot be undone.`;
    
    if (confirm(confirmMessage)) {
        try {
            showDebtLoader(true, "Reversing all settlements...");
            
            // Reverse all settlements
            for (const settlement of paymentHistory) {
                for (const billId of settlement.billIds) {
                    try {
                        const billRecord = await fetchSingleAirtableRecord(AIRTABLE_BILLS_TABLE_NAME, billId);
                        if (billRecord && billRecord.fields['Settled By']) {
                            const currentSettledBy = billRecord.fields['Settled By'] || [];
                            const updatedSettledBy = currentSettledBy.filter(id => id !== settlement.debtorId);
                            
                            await updateAirtableRecord(AIRTABLE_BILLS_TABLE_NAME, billId, { 
                                "Settled By": updatedSettledBy 
                            });
                        }
                    } catch (billError) {
                        console.warn(`Could not reverse settlement for bill ${billId}:`, billError);
                    }
                }
            }
            
            // Clear payment history
            paymentHistory = [];
            localStorage.setItem('paymentHistory', JSON.stringify(paymentHistory));
            
            // Refresh both history and debts
            loadPaymentHistory();
            await loadAndRenderDebts();
            
            showNotification('All settlements reversed successfully!', 'success');
            
        } catch (error) {
            console.error("Failed to clear payment history:", error);
            alert("Error: Could not reverse all settlements. Some may have been partially reversed.");
        } finally {
            showDebtLoader(false);
        }
    }
}

// Show settlement success message
function showSettlementSuccess(settlement) {
    showNotification(
        `Settlement Recorded! ${settlement.debtorName} paid ${settlement.creditorName} ₹${settlement.amount.toFixed(2)}`, 
        'success'
    );
}

// Show reversal success message
function showReversalSuccess(settlement) {
    showNotification(
        `Settlement Reversed! Debt restored: ${settlement.debtorName} owes ${settlement.creditorName} ₹${settlement.amount.toFixed(2)}`, 
        'info'
    );
}

// Generic notification function
function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationContainer') || document.body;
    
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    
    notification.className = `${bgColor} text-white p-4 rounded-lg shadow-lg z-50 max-w-sm mb-2 notification`;
    notification.innerHTML = `
        <div class="flex items-center">
            <div class="mr-3">${icon}</div>
            <div class="font-medium">${message}</div>
        </div>
    `;
    
    container.appendChild(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.parentElement.removeChild(notification);
        }
    }, 5000);
}

// Helper function to fetch a single record from Airtable
async function fetchSingleAirtableRecord(tableName, recordId) {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}/${recordId}`;
    const response = await fetch(url, { 
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } 
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch record ${recordId} from ${tableName}`);
    }
    return await response.json();
}

// Initialize payment history on page load
document.addEventListener("DOMContentLoaded", function() {
    // Load payment history when the app starts
    loadPaymentHistory();
    
    // Override the original renderDebts function
    window.originalRenderDebts = window.renderDebts;
    window.renderDebts = renderDebtsWithHistory;
});

// Export settlement data (optional feature)
function exportPaymentHistory() {
    if (paymentHistory.length === 0) {
        alert('No payment history to export.');
        return;
    }
    
    const csvContent = [
        ['Date', 'Debtor', 'Creditor', 'Amount', 'Time'].join(','),
        ...paymentHistory.map(settlement => {
            const date = new Date(settlement.settledAt);
            return [
                date.toLocaleDateString('en-IN'),
                settlement.debtorName,
                settlement.creditorName,
                settlement.amount.toFixed(2),
                date.toLocaleTimeString('en-IN')
            ].join(',');
        })
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Add export button to the history tab (optional)
document.addEventListener("DOMContentLoaded", function() {
    const historyStats = document.getElementById('historyStats');
    if (historyStats) {
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export CSV';
        exportBtn.className = 'mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm w-full';
        exportBtn.onclick = exportPaymentHistory;
        historyStats.appendChild(exportBtn);
    }
});

// Add this new function to show bill selection modal
function showBillSelectionModal(debtorId, creditorId, totalAmount, bills) {
    // Create modal HTML
    const modalHTML = `
        <div id="billSelectionModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-96 overflow-y-auto">
                <h3 class="text-lg font-semibold mb-4">Select Bills to Settle</h3>
                <p class="text-sm text-gray-600 mb-4">
                    <b>${allPeople[debtorId]?.name}</b> owes <b>${allPeople[creditorId]?.name}</b>
                </p>
                <div id="billCheckboxes" class="space-y-2 mb-4">
                    <!-- Bills will be populated here -->
                </div>
                <div class="flex justify-between items-center pt-4 border-t">
                    <div>
                        <span class="text-sm text-gray-600">Selected: </span>
                        <span id="selectedAmount" class="font-bold text-blue-600">₹0.00</span>
                    </div>
                    <div class="space-x-2">
                        <button onclick="closeBillSelectionModal()" 
                                class="px-4 py-2 text-gray-600 hover:text-gray-800">
                            Cancel
                        </button>
                        <button id="settleSelectedBtn" onclick="settleSelectedBills()" 
                                class="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded disabled:bg-gray-400" 
                                disabled>
                            Settle Selected
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Populate bill checkboxes
    populateBillCheckboxes(bills, totalAmount, debtorId, creditorId);
}

// Add this function to populate bill checkboxes
async function populateBillCheckboxes(bills, totalAmount, debtorId, creditorId) {
    const checkboxContainer = document.getElementById('billCheckboxes');
    const sharePerBill = totalAmount / bills.length; // Assuming equal split for now
    
    // For better UX, we should fetch bill details, but for now use share calculation
    bills.forEach((bill, index) => {
        const billDiv = document.createElement('div');
        billDiv.className = 'flex items-center justify-between p-2 border rounded';
        billDiv.innerHTML = `
            <label class="flex items-center cursor-pointer flex-1">
                <input type="checkbox" value="${bill.id}" class="bill-checkbox mr-2" 
                       onchange="updateSelectedAmount()">
                <div>
                    <div class="font-medium">Bill #${index + 1}</div>
                    <div class="text-sm text-gray-500">Share: ₹${sharePerBill.toFixed(2)}</div>
                </div>
            </label>
        `;
        
        // Store amount as data attribute for calculation
        billDiv.querySelector('.bill-checkbox').dataset.amount = sharePerBill.toFixed(2);
        billDiv.querySelector('.bill-checkbox').dataset.billData = JSON.stringify(bill);
        
        checkboxContainer.appendChild(billDiv);
    });
}

// Add this function to update selected amount
function updateSelectedAmount() {
    const checkboxes = document.querySelectorAll('.bill-checkbox:checked');
    let totalSelected = 0;
    
    checkboxes.forEach(checkbox => {
        totalSelected += parseFloat(checkbox.dataset.amount);
    });
    
    document.getElementById('selectedAmount').textContent = `₹${totalSelected.toFixed(2)}`;
    document.getElementById('settleSelectedBtn').disabled = checkboxes.length === 0;
}

// Add this function to settle selected bills
async function settleSelectedBills() {
    const checkboxes = document.querySelectorAll('.bill-checkbox:checked');
    
    if (checkboxes.length === 0) {
        alert('Please select at least one bill to settle.');
        return;
    }
    
    // Get selected bills and calculate total
    const selectedBills = [];
    let totalAmount = 0;
    let debtorId, creditorId;
    
    checkboxes.forEach(checkbox => {
        const billData = JSON.parse(checkbox.dataset.billData);
        selectedBills.push(billData);
        totalAmount += parseFloat(checkbox.dataset.amount);
    });
    
    // Get debtor and creditor from the first bill (they should be the same for all)
    const modalElement = document.getElementById('billSelectionModal');
    const debtorName = modalElement.querySelector('b').textContent;
    const creditorName = modalElement.querySelectorAll('b')[1].textContent;
    
    // Find IDs from names
    debtorId = Object.keys(allPeople).find(id => allPeople[id].name === debtorName);
    creditorId = Object.keys(allPeople).find(id => allPeople[id].name === creditorName);
    
    // Close modal first
    closeBillSelectionModal();
    
    // Settle the selected bills
    await markDebtAsPaidWithHistory(debtorId, creditorId, totalAmount, selectedBills);
}

// Add this function to close the modal
function closeBillSelectionModal() {
    const modal = document.getElementById('billSelectionModal');
    if (modal) {
        modal.remove();
    }
}

// Add this CSS to your existing styles section (add to the <style> tag in your HTML)
const additionalCSS = `
#billSelectionModal .bill-checkbox:checked + div {
    background-color: #f0f9ff;
}

.debt-row {
    padding: 12px 8px;
    border-bottom: 1px solid #e5e7eb;
}

.debt-row:last-child {
    border-bottom: none;
}

.debt-row button {
    padding: 6px 12px;
    font-size: 0.875em;
    cursor: pointer;
    color: white;
    border-radius: 6px;
    border: none;
    transition: all 0.2s;
    font-weight: 500;
}
`;

// Add the CSS to the page
if (!document.getElementById('additionalStyles')) {
    const style = document.createElement('style');
    style.id = 'additionalStyles';
    style.textContent = additionalCSS;
    document.head.appendChild(style);
}

console.log('Payment History Tracking Script Loaded Successfully!');