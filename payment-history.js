// Enhanced Payment History Tracking Script with Real Bill Data
// Add this to your existing JavaScript code

// --- Payment History Management ---
let paymentHistory = JSON.parse(localStorage.getItem('paymentHistory') || '[]');

// Store current modal context to avoid parsing issues
let currentModalContext = null;

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
            billIds: billsToSettle.map(bill => bill.id),
            billTitles: billsToSettle.map(bill => bill.title || `Bill ${bill.id}`)
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

    // Add simplify option header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex justify-between items-center mb-4 pb-2 border-b';
    headerDiv.innerHTML = `
        <div class="flex items-center space-x-2">
            <h3 class="font-semibold text-gray-700">Outstanding Debts</h3>
            <span class="text-sm text-gray-500">(${balances.length} ${balances.length === 1 ? 'debt' : 'debts'})</span>
        </div>
        <div class="flex space-x-2">
            <button id="simplifyDebtsBtn" 
                    class="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors"
                    ${balances.length <= 1 ? 'disabled' : ''}>
                📊 Simplify Debts
            </button>
            <button id="showOriginalDebtsBtn" 
                    class="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors hidden">
                📋 Show Original
            </button>
        </div>
    `;
    debtsListDiv.appendChild(headerDiv);

    // Add event listeners for simplify buttons
    document.getElementById('simplifyDebtsBtn').addEventListener('click', () => {
        const simplified = simplifyDebts(balances);
        renderDebtsList(simplified, true);
        document.getElementById('simplifyDebtsBtn').classList.add('hidden');
        document.getElementById('showOriginalDebtsBtn').classList.remove('hidden');
    });
    
    document.getElementById('showOriginalDebtsBtn').addEventListener('click', () => {
        renderDebtsList(balances, false);
        document.getElementById('showOriginalDebtsBtn').classList.add('hidden');
        document.getElementById('simplifyDebtsBtn').classList.remove('hidden');
    });

    // Render the actual debts list
    renderDebtsList(balances, false);
}
// Separate function to render the debts list
function renderDebtsList(balances, isSimplified) {
    // Remove existing debts (but keep the header)
    const existingDebts = debtsListDiv.querySelectorAll('.debt-row');
    existingDebts.forEach(debt => debt.remove());
    
    // Add simplification notice if showing simplified debts
    if (isSimplified) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'debt-row bg-orange-50 border-orange-200 border rounded-lg p-3 mb-2';
        noticeDiv.innerHTML = `
            <div class="flex items-center text-orange-700">
                <span class="mr-2">💡</span>
                <div>
                    <div class="font-medium">Simplified Debt Structure</div>
                    <div class="text-sm">Showing optimized payments to minimize total transactions</div>
                </div>
            </div>
        `;
        debtsListDiv.appendChild(noticeDiv);
    }

    balances.forEach(debt => {
        const row = document.createElement('div');
        row.className = 'debt-row';
        
        if (debt.isSimplified) {
            // Simplified debt - single payment only
            row.innerHTML = `
                <div class="flex justify-between items-center">
                    <span><b>${debt.from}</b> pays <b>${debt.to}</b>: <span class="font-bold text-blue-600">₹${debt.amount.toFixed(2)}</span></span>
                    <button onclick="confirmSimplifiedPayment('${debt.fromId}', '${debt.toId}', ${debt.amount}, '${debt.from}', '${debt.to}')" 
                            class="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm">
                        💳 Pay Now
                    </button>
                </div>
            `;
        } else if (debt.bills && debt.bills.length > 1) {
            // Multiple bills - keep existing functionality
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

// Add this new function to handle simplified payments
async function confirmSimplifiedPayment(debtorId, creditorId, amount, debtorName, creditorName) {
    const confirmMessage = `Confirm simplified payment:\n\n` +
                          `${debtorName} will pay ${creditorName} ₹${amount.toFixed(2)}\n\n` +
                          `⚠️ This is a simplified payment and may settle multiple underlying debts.\n` +
                          `Continue?`;
    
    if (confirm(confirmMessage)) {
        try {
            showDebtLoader(true, "Processing simplified payment...");
            
            // For simplified payments, we need to find and settle the underlying bills
            // This is a simplified approach - in practice, you'd want more sophisticated logic
            
            // Record the payment in history
            const settlement = {
                id: Date.now().toString(),
                debtorId: debtorId,
                creditorId: creditorId,
                debtorName: debtorName,
                creditorName: creditorName,
                amount: amount,
                settledAt: new Date().toISOString(),
                billIds: [], // Empty for simplified payments
                billTitles: ['Simplified Payment'],
                isSimplified: true
            };
            
            paymentHistory.unshift(settlement);
            localStorage.setItem('paymentHistory', JSON.stringify(paymentHistory));
            
            // Show success message
            showNotification(
                `Simplified Payment Recorded! ${debtorName} paid ${creditorName} ₹${amount.toFixed(2)}`, 
                'success'
            );
            
            // Note: For a complete implementation, you'd need to:
            // 1. Find all bills between these two people
            // 2. Mark appropriate bills as settled
            // 3. Handle partial settlements correctly
            // This is a simplified version for demonstration
            
            // Refresh the debts view
            await loadAndRenderDebts();
            
        } catch (error) {
            console.error("Failed to process simplified payment:", error);
            alert("Error processing payment. Please try again.");
        } finally {
            showDebtLoader(false);
        }
    }
}

// Add this CSS for better styling
const simplifyDebtsCSS = `
.debt-row {
    padding: 12px 8px;
    border-bottom: 1px solid #e5e7eb;
    transition: background-color 0.2s;
}

.debt-row:hover {
    background-color: #f9fafb;
}

.debt-row:last-child {
    border-bottom: none;
}

#simplifyDebtsBtn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

.debt-row button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
`;

// Add the CSS to the existing enhanced styles
document.addEventListener("DOMContentLoaded", function() {
    // Add the new CSS
    if (!document.getElementById('simplifyDebtsStyles')) {
        const style = document.createElement('style');
        style.id = 'simplifyDebtsStyles';
        style.textContent = simplifyDebtsCSS;
        document.head.appendChild(style);
    }
});


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
                ${settlement.billTitles ? `<div class="text-xs text-gray-400">${settlement.billTitles.join(', ')}</div>` : ''}
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

// Enhanced function to fetch multiple records from Airtable with detailed bill info
async function fetchMultipleAirtableRecords(tableName, recordIds) {
    try {
        const promises = recordIds.map(id => fetchSingleAirtableRecord(tableName, id));
        const results = await Promise.all(promises);
        return results.map(result => ({
            id: result.id,
            fields: result.fields
        }));
    } catch (error) {
        console.error('Error fetching multiple records:', error);
        throw error;
    }
}

// Enhanced function to calculate individual shares for each person in each bill
function calculatePersonShare(bill, personId) {
    const splitBetween = bill.fields['Split between'] || [];
    const totalAmount = bill.fields['Total Amount'] || 0;
    
    if (!splitBetween.includes(personId)) {
        return 0;
    }
    
    // For equal split (most common case)
    return totalAmount / splitBetween.length;
}

// FIXED: Show bill selection modal with proper context storage
async function showBillSelectionModal(debtorId, creditorId, totalAmount, bills) {
    try {
        showDebtLoader(true, "Loading bill details...");
        
        // Store the context for later use - THIS IS THE KEY FIX
        currentModalContext = {
            debtorId: debtorId,
            creditorId: creditorId,
            debtorName: allPeople[debtorId]?.name || 'Unknown',
            creditorName: allPeople[creditorId]?.name || 'Unknown',
            totalAmount: totalAmount
        };
        
        // Fetch detailed bill information from Airtable
        const billIds = bills.map(bill => bill.id);
        const detailedBills = await fetchMultipleAirtableRecords(AIRTABLE_BILLS_TABLE_NAME, billIds);
        
        // Create modal HTML
        const modalHTML = `
            <div id="billSelectionModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-content z-50">
                <div class="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-96 overflow-y-auto">
                    <h3 class="text-lg font-semibold mb-4">Select Bills to Settle</h3>
                    <p class="text-sm text-gray-600 mb-4">
                        <b>${currentModalContext.debtorName}</b> owes <b>${currentModalContext.creditorName}</b>
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
        
        // Populate bill checkboxes with real data
        await populateBillCheckboxesWithRealData(detailedBills, debtorId, creditorId);
        
    } catch (error) {
        console.error('Error loading bill selection modal:', error);
        alert('Error loading bill details. Please try again.');
        currentModalContext = null; // Clear context on error
    } finally {
        showDebtLoader(false);
    }
}

// ENHANCED: Populate bill checkboxes with real bill data from Airtable
async function populateBillCheckboxesWithRealData(detailedBills, debtorId, creditorId) {
    const checkboxContainer = document.getElementById('billCheckboxes');
    
    if (!checkboxContainer) {
        console.error('Checkbox container not found');
        return;
    }
    
    for (let i = 0; i < detailedBills.length; i++) {
        const billRecord = detailedBills[i];
        const billFields = billRecord.fields;
        
        // Calculate the debtor's share for this specific bill
        const debtorShare = calculatePersonShare(billRecord, debtorId);
        
        // Get bill details
        const billTitle = billFields['Title'] || `Bill #${i + 1}`;
        const totalAmount = billFields['Total Amount'] || 0;
        const billDate = billFields['Date'] ? new Date(billFields['Date']).toLocaleDateString('en-IN') : 'No date';
        const splitBetween = billFields['Split between'] || [];
        const splitCount = splitBetween.length;
        
        // Create bill display element
        const billDiv = document.createElement('div');
        billDiv.className = 'flex items-center justify-between p-3 border rounded hover:bg-gray-50';
        billDiv.innerHTML = `
            <label class="flex items-center cursor-pointer flex-1">
                <input type="checkbox" value="${billRecord.id}" class="bill-checkbox mr-3" 
                       onchange="updateSelectedAmount()">
                <div class="flex-1">
                    <div class="font-medium text-gray-900">${billTitle}</div>
                    <div class="text-sm text-gray-600">
                        Total: ₹${totalAmount.toFixed(2)} | Split among ${splitCount} people | ${billDate}
                    </div>
                    <div class="text-sm font-medium text-blue-600">
                        ${allPeople[debtorId]?.name || 'Debtor'}'s share: ₹${debtorShare.toFixed(2)}
                    </div>
                </div>
            </label>
        `;
        
        // Store bill data for later use
        const checkbox = billDiv.querySelector('.bill-checkbox');
        checkbox.dataset.amount = debtorShare.toFixed(2);
        checkbox.dataset.billData = JSON.stringify({
            id: billRecord.id,
            title: billTitle,
            totalAmount: totalAmount,
            debtorShare: debtorShare,
            settledBy: billFields['Settled By'] || []
        });
        
        checkboxContainer.appendChild(billDiv);
    }
    
    // If no bills found
    if (detailedBills.length === 0) {
        checkboxContainer.innerHTML = '<p class="text-gray-500 text-center">No bills found to settle.</p>';
    }
}

// Update selected amount calculation
function updateSelectedAmount() {
    const checkboxes = document.querySelectorAll('.bill-checkbox:checked');
    let totalSelected = 0;
    
    checkboxes.forEach(checkbox => {
        totalSelected += parseFloat(checkbox.dataset.amount);
    });
    
    document.getElementById('selectedAmount').textContent = `₹${totalSelected.toFixed(2)}`;
    document.getElementById('settleSelectedBtn').disabled = checkboxes.length === 0;
}

// FIXED: Enhanced settle selected bills function using stored context
async function settleSelectedBills() {
    const checkboxes = document.querySelectorAll('.bill-checkbox:checked');
    
    if (checkboxes.length === 0) {
        alert('Please select at least one bill to settle.');
        return;
    }
    
    // Check if we have the modal context - THIS IS THE KEY FIX
    if (!currentModalContext) {
        alert('Error: Could not identify debtor and creditor. Please try again.');
        return;
    }
    
    // Get selected bills and calculate total
    const selectedBills = [];
    let totalAmount = 0;
    
    checkboxes.forEach(checkbox => {
        const billData = JSON.parse(checkbox.dataset.billData);
        selectedBills.push(billData);
        totalAmount += parseFloat(checkbox.dataset.amount);
    });
    
    // Use the stored context instead of trying to parse HTML
    const debtorId = currentModalContext.debtorId;
    const creditorId = currentModalContext.creditorId;
    
    // Close modal first
    closeBillSelectionModal();
    
    // Convert bill data format for settlement function
    const billsForSettlement = selectedBills.map(bill => ({
        id: bill.id,
        title: bill.title,
        settledBy: bill.settledBy || []
    }));
    
    // Settle the selected bills
    await markDebtAsPaidWithHistory(debtorId, creditorId, totalAmount, billsForSettlement);
}

// FIXED: Close modal function with context cleanup
async function closeBillSelectionModal() {
    const modal = document.getElementById('billSelectionModal');
    if (modal) {
        modal.remove();
    }
    
    // Clear the modal context - IMPORTANT FOR CLEANUP
    currentModalContext = null;
    
    // Add these lines to refresh the debts list after closing the modal
    showDebtLoader(true, "Loading debts..."); // Optional: show loader while debts reload
    try {
        await loadAndRenderDebts();
    } catch (e) {
        console.error("Failed to reload debts after closing modal:", e);
        // You might want to display an error to the user here
    } finally {
        showDebtLoader(false); // Hide loader
    }
}

// Export payment history function
function exportPaymentHistory() {
    if (paymentHistory.length === 0) {
        alert('No payment history to export.');
        return;
    }
    
    const csvContent = [
        ['Date', 'Time', 'Debtor', 'Creditor', 'Amount', 'Bills'].join(','),
        ...paymentHistory.map(settlement => {
            const date = new Date(settlement.settledAt);
            return [
                date.toLocaleDateString('en-IN'),
                date.toLocaleTimeString('en-IN'),
                settlement.debtorName,
                settlement.creditorName,
                settlement.amount.toFixed(2),
                (settlement.billTitles || []).join('; ')
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
// Simplify debts using a basic debt settlement algorithm
function simplifyDebts(balances) {
    if (balances.length <= 1) return balances;
    
    // Convert to creditor/debtor format for easier calculation
    const creditors = []; // People who are owed money
    const debtors = [];   // People who owe money
    
    // Group by person and calculate net balance
    const netBalances = {};
    
    balances.forEach(debt => {
        // Add to debtor's balance (negative)
        if (!netBalances[debt.fromId]) {
            netBalances[debt.fromId] = { id: debt.fromId, name: debt.from, balance: 0 };
        }
        netBalances[debt.fromId].balance -= debt.amount;
        
        // Add to creditor's balance (positive)
        if (!netBalances[debt.toId]) {
            netBalances[debt.toId] = { id: debt.toId, name: debt.to, balance: 0 };
        }
        netBalances[debt.toId].balance += debt.amount;
    });
    
    // Separate into creditors and debtors
    Object.values(netBalances).forEach(person => {
        if (person.balance > 0.01) { // Small threshold for floating point errors
            creditors.push(person);
        } else if (person.balance < -0.01) {
            debtors.push({ ...person, balance: Math.abs(person.balance) });
        }
    });
    
    // Sort creditors and debtors by amount (largest first)
    creditors.sort((a, b) => b.balance - a.balance);
    debtors.sort((a, b) => b.balance - a.balance);
    
    // Create simplified debts
    const simplifiedDebts = [];
    let i = 0, j = 0;
    
    while (i < creditors.length && j < debtors.length) {
        const creditor = creditors[i];
        const debtor = debtors[j];
        
        const settleAmount = Math.min(creditor.balance, debtor.balance);
        
        if (settleAmount > 0.01) { // Only add if amount is meaningful
            simplifiedDebts.push({
                fromId: debtor.id,
                from: debtor.name,
                toId: creditor.id,
                to: creditor.name,
                amount: settleAmount,
                bills: [], // Simplified debts don't have specific bills
                isSimplified: true
            });
        }
        
        // Update remaining balances
        creditor.balance -= settleAmount;
        debtor.balance -= settleAmount;
        
        // Move to next creditor or debtor if current one is settled
        if (creditor.balance < 0.01) i++;
        if (debtor.balance < 0.01) j++;
    }
    
    return simplifiedDebts;
}



// Enhanced CSS styles
const enhancedCSS = `
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

.payment-history-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-bottom: 1px solid #e5e7eb;
    background-color: #fafafa;
    border-radius: 8px;
    margin-bottom: 8px;
}

.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.bill-checkbox {
    transform: scale(1.2);
}

#billCheckboxes label:hover {
    background-color: #f8fafc;
}
`;

// Initialize enhanced payment history system
document.addEventListener("DOMContentLoaded", function() {
    // Add enhanced CSS to the page
    if (!document.getElementById('enhancedStyles')) {
        const style = document.createElement('style');
        style.id = 'enhancedStyles';
        style.textContent = enhancedCSS;
        document.head.appendChild(style);
    }
    
    // Load payment history when the app starts
    loadPaymentHistory();
    
    // Override the original renderDebts function
    if (typeof window.renderDebts === 'function') {
        window.originalRenderDebts = window.renderDebts;
        window.renderDebts = renderDebtsWithHistory;
    }
    
    // Add export button to the history tab
    setTimeout(() => {
        const historyStats = document.getElementById('historyStats');
        if (historyStats && !document.getElementById('exportBtn')) {
            const exportBtn = document.createElement('button');
            exportBtn.id = 'exportBtn';
            exportBtn.textContent = 'Export CSV';
            exportBtn.className = 'mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm w-full';
            exportBtn.onclick = exportPaymentHistory;
            historyStats.appendChild(exportBtn);
        }
    }, 1000);
});

console.log('Enhanced Payment History Tracking Script Loaded Successfully!');
