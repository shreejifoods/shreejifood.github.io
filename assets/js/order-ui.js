// Initialize EmailJS
(function () {
    if (typeof emailjs !== 'undefined') {
        emailjs.init("byjrGBN3r1SvvFFhJ");
    } else {
        console.warn("EmailJS script not loaded — email notifications disabled");
    }
})();

// DOM Elements
const menuContainer = document.getElementById('days-container');
const cartContainer = document.getElementById('cart-items-container');
const cartSubtotalEl = document.getElementById('cart-subtotal');
const cartTotalEl = document.getElementById('cart-total');
const checkoutSection = document.getElementById('checkout-section');
const checkoutForm = document.getElementById('checkout-form');
const btnShowCheckout = document.getElementById('btn-show-checkout');
const cartActionArea = document.getElementById('cart-action-area');
const cartCountBadge = document.getElementById('cart-count-badge');

// Delivery & Payment Elements
const deliveryDetailsDiv = document.getElementById('delivery-details');
const deliveryZoneSelect = document.getElementById('delivery-zone');
const rowDelivery = document.getElementById('row-delivery');
const cartDeliveryEl = document.getElementById('cart-delivery');

// State
let deliveryZones = [];
let validatedTown = '';      // town from last postcode check
let validatedPostcode = '';  // full postcode from last check
let currentOrderType = 'pickup';
let deliveryCost = 0;
let paypalRendered = false;

// Online ordering fee (2%) to cover payment processing costs
const ONLINE_FEE_RATE = 0.02;
const cartServiceFeeEl = document.getElementById('cart-service-fee');

// WhatsApp notification number (international format, no +)
const WHATSAPP_NOTIFY_NUMBER = '447907090351';

// --- Initialization ---
async function init() {
    try {
        const response = await fetch('assets/data/menu.json');
        const data = await response.json();

        deliveryZones = data.delivery_zones || [];
        populateDeliveryZones();

        // --- Cart Validation Logic ---
        // Remove items from the cart if their day is no longer available (e.g. day passed or after 1pm)
        if (window.cart && window.cart.items.length > 0) {
            const validDays = window.MenuLogic.getAvailableOrderDays();
            const originalCount = window.cart.items.length;

            // Filter out items whose day is not in the currently available days
            window.cart.items = window.cart.items.filter(item => validDays.includes(item.day));

            if (window.cart.items.length < originalCount) {
                window.cart.save();
                // We'll show a toast after UI is ready, or rely on updateCartUI to reflect changes
                setTimeout(() => showToast("Note: Expired items were removed from your cart."), 1000);
            }
        }

        renderMenu(data.menu);
        updateCartUI();

    } catch (e) {
        console.error("Failed to init", e);
        if (menuContainer) menuContainer.innerHTML = `<div class="alert alert-danger">Error loading menu. Please try refreshing.</div>`;
    }
}

// --- Telegram Bot Config ---
const TG_BOT_TOKEN = "8237587298:AAHxenj9KPcCXj850fmz2KBcNt0Y6OllUUw";
const TG_CHAT_ID = "8438924862";
const sentOrderIds = new Set(); // Prevent duplicate notifications

async function sendTelegramNotification(customer, items, paymentId) {
    // Deduplication handled by parent (sendOrderEmail)
    // if (sentOrderIds.has(paymentId)) return;
    // sentOrderIds.add(paymentId);

    const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const fee = Math.round(subtotal * ONLINE_FEE_RATE * 100) / 100;
    const total = subtotal + deliveryCost + fee;

    // Format message for Telegram
    const itemsList = items.map(i => `• ${i.day}: ${i.name} x${i.quantity}`).join('\n');
    const msg = `🚨 *NEW ORDER RECEIVED* 🚨\n\n` +
        `👤 *Customer*: ${customer.name}\n` +
        `📞 *Phone*: ${customer.phone}\n` +
        `📧 *Email*: ${customer.email}\n` +
        `📍 *Address*: ${customer.address}\n\n` +
        `🛒 *Items*:\n${itemsList}\n\n` +
        `💰 *Total Paid*: £${total.toFixed(2)}\n` +
        `🆔 *Pay ID*: \`${paymentId}\``;

    const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TG_CHAT_ID,
                text: msg,
                parse_mode: 'Markdown'
            })
        });
        console.log("Telegram notification sent!");
    } catch (e) {
        console.error("Failed to send Telegram msg", e);
    }
}

function populateDeliveryZones() {
    if (!deliveryZoneSelect) return;
    let html = '<option value="0">Select Locality...</option>';
    deliveryZones.forEach(zone => {
        html += `<option value="${zone.price}">${zone.name} (+£${zone.price.toFixed(2)})</option>`;
    });
    deliveryZoneSelect.innerHTML = html;
}

// --- Order Type Handler ---
document.querySelectorAll('input[name="orderType"]').forEach(input => {
    input.addEventListener('change', (e) => {
        currentOrderType = e.target.value;
        if (currentOrderType === 'delivery') {
            deliveryDetailsDiv.style.display = 'block';
            rowDelivery.style.display = 'flex';
        } else {
            deliveryDetailsDiv.style.display = 'none';
            rowDelivery.style.display = 'none';
            deliveryCost = 0;
            deliveryZoneSelect.value = "0";
        }
        updateCartUI();
    });
});

if (deliveryZoneSelect) {
    deliveryZoneSelect.addEventListener('change', (e) => {
        deliveryCost = parseFloat(e.target.value);
        updateCartUI();
    });
}

// Postcode Logic
const postcodeInput = document.getElementById('delivery-postcode');
const btnCheckPostcode = document.getElementById('btn-check-postcode');
const postcodeFeed = document.getElementById('postcode-feed');

if (btnCheckPostcode) {
    btnCheckPostcode.addEventListener('click', validatePostcode);
}
if (postcodeInput) {
    postcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') validatePostcode();
    });
}

function validatePostcode() {
    if (!postcodeInput) return;
    const code = postcodeInput.value.trim().toUpperCase().replace(/\s/g, '');

    if (code.length < 3) {
        setPostcodeError("Invalid Postcode");
        return;
    }

    let foundZone = null;

    for (const zone of deliveryZones) {
        if (zone.prefixes) {
            for (const prefix of zone.prefixes) {
                if (code.startsWith(prefix)) {
                    foundZone = zone;
                    break;
                }
            }
        }
        if (foundZone) break;
    }

    if (foundZone) {
        postcodeFeed.className = "small mb-2 fw-bold text-success";
        postcodeFeed.innerText = `✅ We deliver to ${foundZone.name} (£${foundZone.price.toFixed(2)})`;

        let targetOptionIndex = 0;
        for (let i = 0; i < deliveryZoneSelect.options.length; i++) {
            if (deliveryZoneSelect.options[i].text.includes(foundZone.name)) {
                targetOptionIndex = i;
                break;
            }
        }

        // Auto-select but keep disabled — user doesn't need to change this
        deliveryZoneSelect.selectedIndex = targetOptionIndex;
        deliveryZoneSelect.disabled = true;
        deliveryCost = foundZone.price;
        validatedTown = foundZone.name;
        validatedPostcode = postcodeInput.value.trim().toUpperCase();
        updateCartUI();


    } else {
        setPostcodeError(`Sorry, we don't deliver to area ${code} yet.`);
        deliveryZoneSelect.selectedIndex = 0;
        deliveryZoneSelect.disabled = true;
        deliveryCost = 0;
        updateCartUI();
    }
}

function setPostcodeError(msg) {
    postcodeFeed.className = "small mb-2 fw-bold text-danger";
    postcodeFeed.innerText = msg;
}

// --- Render Menu ---
function renderMenu(menuData) {
    if (!menuContainer) return;

    const availableDays = window.MenuLogic.getAvailableOrderDays(new Date());
    const dayOrder = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5 };
    availableDays.sort((a, b) => dayOrder[a] - dayOrder[b]);

    // Cards are inside a col-lg-8 parent, so col-lg-6 here = 50% of 66% = ~33% of page
    // This gives each card ~380-400px on a 1400px screen, which is a good card width
    let colClass = 'col-12 col-md-6';
    if (availableDays.length <= 2) {
        colClass = 'col-12';
    }

    let html = '';

    availableDays.forEach(day => {
        const dayMenu = menuData[day];
        if (!dayMenu || !dayMenu.active) return;
        const mainItem = dayMenu.items[0];

        html += `
            <div class="${colClass}">
                <div class="card w-100 shadow-sm border-0 meal-card h-100" style="transition: transform 0.2s;">
                    <div class="card-body d-flex align-items-start gap-3 p-3">
                        <div class="day-meal-image ${day.toLowerCase()}-img" 
                             onclick="openMealImage(this, '${day}')" 
                             title="Click to zoom image"
                             role="button"
                             aria-label="View larger image for ${day}"></div>
                        <div class="flex-grow-1 d-flex flex-column" style="min-height: 100%;">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="card-title fw-bold mb-0" style="font-family: 'Source Serif 4', serif; color: #3d2e00;">
                                    ${day}
                                </h6>
                                <span class="badge rounded-pill fw-semibold px-2 py-1" style="font-size: 0.8rem; background: #e6a800; color: #fff;">£${mainItem.price.toFixed(2)}</span>
                            </div>
                            <div class="meal-item-interactive mb-2" style="font-size: 0.85rem; color: #5a4a2a;">
                                <ul class="mb-0 ps-3">
                                    ${mainItem.description.split(',').map(item => `<li>${item.trim()}</li>`).join('')}
                                </ul>
                            </div>
                            <button class="btn btn-sm mt-auto w-100 d-flex align-items-center justify-content-center py-2" 
                                style="background: #e6a800; color: #fff; border: none; border-radius: 8px; font-weight: 600;"
                                onmouseover="this.style.background='#d49a00'" onmouseout="this.style.background='#e6a800'"
                                onclick="addItemToCart('${mainItem.id}', '${mainItem.name}', ${mainItem.price}, '${day}')"
                                aria-label="Add ${day}'s meal (${mainItem.name}) to order">
                                + Add to Order
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    if (availableDays.length === 0) {
        html = `
            <div class="col-12 text-center py-5">
                <div class="alert alert-info d-inline-block">
                    <h4>Ordering Closed</h4>
                    <p class="mb-0">Ordering for this week is closed. Please check back Monday!</p>
                </div>
            </div>
        `;
    }

    menuContainer.innerHTML = html;
}

// --- Cart & Checkout Flow ---
function updateCartUI() {
    if (!cartContainer) return;

    const items = window.cart.items;
    const subtotal = window.cart.getTotal();
    const serviceFee = Math.round(subtotal * ONLINE_FEE_RATE * 100) / 100;
    const total = subtotal + deliveryCost + serviceFee;

    if (cartSubtotalEl) cartSubtotalEl.innerText = '£' + subtotal.toFixed(2);
    if (cartDeliveryEl) cartDeliveryEl.innerText = '£' + deliveryCost.toFixed(2);
    if (cartServiceFeeEl) cartServiceFeeEl.innerText = '£' + serviceFee.toFixed(2);
    if (cartTotalEl) cartTotalEl.innerText = '£' + total.toFixed(2);

    window._checkoutTotal = total.toFixed(2);

    const totalQty = items.reduce((a, b) => a + b.quantity, 0);
    if (cartCountBadge) cartCountBadge.innerText = totalQty;

    // Update floating mobile cart bar
    const mobileBar = document.getElementById('mobile-cart-bar');
    const mobileCount = document.getElementById('mobile-cart-count');
    const mobileTotal = document.getElementById('mobile-cart-total');
    if (mobileBar) {
        if (totalQty > 0 && window.innerWidth < 992) {
            mobileBar.style.display = 'block';
            if (mobileCount) mobileCount.innerText = totalQty + (totalQty === 1 ? ' item' : ' items');
            if (mobileTotal) mobileTotal.innerText = '£' + total.toFixed(2);
        } else {
            mobileBar.style.display = 'none';
        }
    }

    if (items.length === 0) {
        cartContainer.innerHTML = `<div class="text-center py-3 text-muted"><p class="mb-0">Your cart is empty.</p></div>`;
        btnShowCheckout.disabled = true;
        btnShowCheckout.innerText = "Add items to start";
        checkoutSection.style.display = 'none';
        cartActionArea.style.display = 'block';
        return;
    }

    let html = '<ul class="list-group list-group-flush">';
    items.forEach(item => {
        html += `
            <li class="list-group-item px-0 d-flex justify-content-between align-items-center bg-transparent border-bottom-0 pb-0 mb-2">
                <div class="flex-grow-1 pe-2">
                    <div class="fw-bold text-dark lh-sm" style="font-family: 'Source Serif 4', serif; font-size: 0.95rem;">${item.name}</div>
                    <small class="text-muted">£${item.price.toFixed(2)} × ${item.quantity}</small>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <button class="btn btn-sm px-2 py-0" style="background: ${item.quantity <= 2 ? '#ccc' : '#e6a800'}; color: #fff; border: none; border-radius: 6px; font-weight: bold; font-size: 0.85rem;${item.quantity <= 2 ? ' cursor: not-allowed;' : ''}"
                        onclick="changeCartQty('${item.id}', '${item.day}', ${item.quantity - 1})" ${item.quantity <= 2 ? 'disabled' : ''}>−</button>
                    <span class="fw-bold text-dark" style="min-width: 20px; text-align: center;">${item.quantity}</span>
                    <button class="btn btn-sm px-2 py-0" style="background: #e6a800; color: #fff; border: none; border-radius: 6px; font-weight: bold; font-size: 0.85rem;"
                        onclick="changeCartQty('${item.id}', '${item.day}', ${item.quantity + 1})">+</button>
                    <button class="cart-remove-btn ms-1" onclick="removeItemFromCart('${item.id}', '${item.day}')" title="Remove" aria-label="Remove item">
                        🗑️
                    </button>
                </div>
            </li>
        `;
    });
    html += '</ul>';
    cartContainer.innerHTML = html;

    if (totalQty < 2) {
        btnShowCheckout.disabled = true;
        btnShowCheckout.innerText = "Minimum 2 portions required";
    } else {
        btnShowCheckout.disabled = false;
        btnShowCheckout.innerText = "Proceed to Checkout →";
    }
}

// --- Cart Actions ---
window.addItemToCart = (id, name, price, day) => {
    const existing = window.cart.items.find(i => i.id === id && i.day === day);
    if (existing) {
        window.cart.add({ id, name, price }, day, 1);
    } else {
        window.cart.add({ id, name, price }, day, 2);
    }
    updateCartUI();
    showToast(`Added to Order (min. 2 portions)`);
};

window.changeCartQty = (id, day, newQty) => {
    if (newQty < 2) {
        showToast('Minimum 2 portions per meal');
        return;
    }
    window.cart.updateQuantity(id, day, newQty);
    updateCartUI();
};

window.removeItemFromCart = (id, day) => {
    window.cart.remove(id, day);
    updateCartUI();
};

window.addEventListener('cart-updated', updateCartUI);

btnShowCheckout.addEventListener('click', () => {
    if (currentOrderType === 'delivery' && deliveryCost === 0) {
        alert("Please select a delivery area.");
        deliveryZoneSelect.focus();
        return;
    }

    cartActionArea.style.display = 'none';
    checkoutSection.style.display = 'block';

    // Render PayPal buttons ONCE when visible (if PayPal SDK is loaded)
    if (!paypalRendered && typeof paypal !== 'undefined') {
        renderPayPalButtons();
        paypalRendered = true;
    } else if (typeof paypal === 'undefined') {
        // PayPal not loaded — show a friendly fallback
        const ppContainer = document.getElementById('paypal-button-container');
        if (ppContainer) {
            ppContainer.innerHTML = `
                <div class="alert alert-warning text-center py-3" style="border-radius: 10px; font-size: 0.85rem;">
                    <strong>💳 Online payment coming soon!</strong><br>
                    <span class="text-muted">For now, please place your order and pay on collection/delivery.</span>
                    <div class="mt-3">
                        <button type="button" class="btn btn-sm fw-bold" id="btn-place-order-manual"
                            style="background: #e6a800; color: #fff; border: none; border-radius: 8px; padding: 8px 24px;">
                            📝 Place Order (Pay Later)
                        </button>
                    </div>
                </div>
            `;
            // Handle manual order placement
            document.getElementById('btn-place-order-manual').addEventListener('click', handleManualOrder);
        }
    }

    checkoutSection.scrollIntoView({ behavior: 'smooth' });
});

// --- Manual Order (when PayPal is not yet configured) ---
async function handleManualOrder() {
    const custName = document.getElementById('cust-name').value.trim();
    const custPhone = document.getElementById('cust-phone').value.trim();
    const custEmail = document.getElementById('cust-email').value.trim();

    if (!custName || !custPhone) {
        alert('Please fill in at least your name and phone number.');
        return;
    }

    const customer = {
        name: custName,
        email: custEmail,
        phone: custPhone,
        address: document.getElementById('cust-address').value,
        type: currentOrderType,
        range: currentOrderType === 'delivery' ? deliveryZoneSelect.options[deliveryZoneSelect.selectedIndex].text : '',
        paymentId: 'PENDING (Pay on collection/delivery)'
    };

    try {
        // Send email notification
        await sendOrderEmail(customer, window.cart.items);

        // Send WhatsApp notification
        sendWhatsAppNotification(customer, window.cart.items);

        // Generate PDF Receipt
        const pdfBlob = generateInvoicePDF(customer, window.cart.items);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = `Invoice_${Date.now()}.pdf`;
        link.click();

        window.cart.clear();
        showOrderSuccess(customer);
    } catch (err) {
        console.error(err);
        // Still try WhatsApp even if email fails
        sendWhatsAppNotification(customer, window.cart.items);
        alert('Order placed! We will confirm via WhatsApp/phone.');
        window.cart.clear();
        showOrderSuccess(customer);
    }
}

function renderPayPalButtons() {
    paypal.Buttons({
        style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'paypal',
            height: 45
        },
        createOrder: function (data, actions) {
            const custName = document.getElementById('cust-name').value.trim();
            const custPhone = document.getElementById('cust-phone').value.trim();
            const custEmail = document.getElementById('cust-email').value.trim();

            if (!custName || !custPhone || !custEmail) {
                alert('Please fill in your name, phone, and email before paying.');
                throw new Error('Missing customer details');
            }

            const items = window.cart.items;
            const itemsList = items.map(i => `${i.day}: ${i.name} x${i.quantity}`).join(', ');

            return actions.order.create({
                purchase_units: [{
                    description: `Shreeji Food Order: ${itemsList}`,
                    amount: {
                        value: window._checkoutTotal,
                        currency_code: 'GBP'
                    }
                }]
            });
        },
        onApprove: async function (data, actions) {
            const details = await actions.order.capture();

            const customer = {
                name: document.getElementById('cust-name').value,
                email: document.getElementById('cust-email').value,
                phone: document.getElementById('cust-phone').value,
                address: document.getElementById('cust-address').value,
                type: currentOrderType,
                range: currentOrderType === 'delivery' ? deliveryZoneSelect.options[deliveryZoneSelect.selectedIndex].text : '',
                paymentId: details.id
            };

            try {
                await sendOrderEmail(customer, window.cart.items);

                // Send WhatsApp notification to the business owner
                sendWhatsAppNotification(customer, window.cart.items);

                // Generate PDF Receipt (User downloads it)
                try {
                    const pdfBlob = generateInvoicePDF(customer, window.cart.items);
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(pdfBlob);
                    link.download = `Invoice_${Date.now()}.pdf`;
                    link.click();
                } catch (pdfErr) {
                    console.error("PDF generation failed", pdfErr);
                }

                window.cart.clear();
                showOrderSuccess(customer, window.cart.items); // Pass items for WhatsApp button
            } catch (err) {
                console.error("Order process error:", err);
                alert('Warning: Order notification issue. Please use the WhatsApp button on the next screen.');
                showOrderSuccess(customer, window.cart.items);
            }
        },
        onError: function (err) {
            console.error('PayPal error:', err);
            alert('Payment failed. Please try again or contact us if the issue persists.');
        },
        onCancel: function (data) {
            console.log('Payment cancelled', data);
            showToast('Payment cancelled. You can try again.');
        }
    }).render('#paypal-button-container');
}

// --- WhatsApp Notification ---
function sendWhatsAppNotification(customer, items) {
    const subtotal = window.cart.getTotal();
    const fee = Math.round(subtotal * ONLINE_FEE_RATE * 100) / 100;
    const total = subtotal + deliveryCost + fee;

    const itemsList = items.map(i => `📅 *[${i.day}]:* ${i.name} ×${i.quantity}`).join('\n');

    const message = `🍛 *NEW ORDER - Shreeji Food*\n\n` +
        `👤 *Customer:* ${customer.name}\n` +
        `📞 *Phone:* ${customer.phone}\n` +
        `📧 *Email:* ${customer.email || 'N/A'}\n` +
        `📍 *Type:* ${customer.type === 'delivery' ? 'Delivery' : 'Pickup'}\n` +
        (customer.address ? `🏠 *Address:* ${customer.address}\n` : '') +
        (customer.range ? `🗺️ *Zone:* ${customer.range}\n` : '') +
        `\n📋 *Order Items (Delivery per Meal Date):*\n${itemsList}\n` +
        `\n_(Please deliver items on their respective days)_\n\n` +
        `💰 *Subtotal:* £${subtotal.toFixed(2)}\n` +
        `📦 *Delivery:* £${deliveryCost.toFixed(2)}\n` +
        `🔧 *Service Fee:* £${fee.toFixed(2)}\n` +
        `💵 *Total:* £${total.toFixed(2)}\n\n` +
        `💳 *Payment:* ${customer.paymentId}`;

    // Use WhatsApp API to send message via the customer's WhatsApp
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NOTIFY_NUMBER}&text=${encodedMessage}`;

    // Open WhatsApp in a new tab — the customer just needs to press "Send"
    window.open(whatsappUrl, '_blank');
}

// --- Order Success Page ---
function showOrderSuccess(customer, items) {
    if (!items || items.length === 0) {
        // Fallback if items cleared already (shouldn't happen with correct flow)
        items = [];
    }

    // Check if we can reconstruct the WhatsApp link
    let whatsappBtnHtml = '';
    if (items.length > 0) {
        const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        // Recalculate based on known fee rate
        const fee = Math.round(subtotal * ONLINE_FEE_RATE * 100) / 100;
        // Don't have delivery cost easily here unless globally available (it is: deliveryCost global var)
        const total = subtotal + deliveryCost + fee;

        const itemsList = items.map(i => `📅 *[${i.day}]:* ${i.name} ×${i.quantity}`).join('\n');

        const message = `🍛 *NEW ORDER - Shreeji Food*\n\n` +
            `👤 *Customer:* ${customer.name}\n` +
            `📞 *Phone:* ${customer.phone}\n` +
            `📧 *Email:* ${customer.email || 'N/A'}\n` +
            `📍 *Type:* ${customer.type === 'delivery' ? 'Delivery' : 'Pickup'}\n` +
            (customer.address ? `🏠 *Address:* ${customer.address}\n` : '') +
            (customer.range ? `🗺️ *Zone:* ${customer.range}\n` : '') +
            `\n📋 *Order Items (Delivery per Meal Date):*\n${itemsList}\n` +
            `\n_(Please deliver items on their respective days)_\n\n` +
            `💰 *Subtotal:* £${subtotal.toFixed(2)}\n` +
            `📦 *Delivery:* ${typeof deliveryCost !== 'undefined' ? '£' + deliveryCost.toFixed(2) : 'N/A'}\n` +
            `🔧 *Service Fee:* £${fee.toFixed(2)}\n` +
            `💵 *Total:* £${total.toFixed(2)}\n\n` +
            `💳 *Payment:* ${customer.paymentId}`;

        const whatsappUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NOTIFY_NUMBER}&text=${encodeURIComponent(message)}`;

        whatsappBtnHtml = `
            <div class="d-grid gap-2 mb-4">
                <a href="${whatsappUrl}" target="_blank" class="btn btn-success btn-lg d-flex align-items-center justify-content-center gap-2" 
                   style="border-radius: 12px; font-weight: 600;">
                   <i class="bi bi-whatsapp"></i> Send Order via WhatsApp (Optional)
                </a>
            </div>
        `;
    }

    // Determine Order Type & Timing Message
    const isDelivery = deliveryCost > 0;
    const timingMsg = isDelivery
        ? "Expected Delivery: <strong>7:00 PM</strong>"
        : "Pickup Time: <strong>5:30 PM</strong>";

    const itemsSummary = items.map(i =>
        `<div class="d-flex justify-content-between border-bottom py-2">
            <span>${i.day}: ${i.name}</span>
            <span class="fw-bold">x${i.quantity}</span>
        </div>`
    ).join('');

    const supportLink = `https://wa.me/${WHATSAPP_NOTIFY_NUMBER}`;

    const positiveMsgs = [
        "Great Choice!",
        "Made with Love!",
        "Excellent Selection!",
        "You're going to love this!",
        "Authentic Taste Awaits!"
    ];
    const randomMsg = positiveMsgs[Math.floor(Math.random() * positiveMsgs.length)];

    document.getElementById('menu-app').innerHTML = `
        <div class="container py-5">
            <div class="text-center mb-5">
                <div class="mb-3">
                    <i class="bi bi-check-circle-fill text-success" style="font-size: 4rem;"></i>
                </div>
                <h2 class="fw-bold mb-2">Order Confirmed</h2>
                <p class="text-muted fs-5">Thank you, ${customer.name.split(' ')[0]}!</p>
            </div>

            <div class="card border-0 shadow-sm mx-auto" style="max-width: 500px; border-radius: 16px; background-color: #fff8e1;">
                <div class="card-body p-4 text-center">
                    <h4 class="mb-1" style="color: #d49a00;">${randomMsg}</h4>
                    <p class="mb-3">Your meal will be ready shortly.</p>
                    
                    <div class="bg-white rounded p-3 mb-3 shadow-sm">
                        <div class="text-uppercase small text-muted letter-spacing-1">Order ID</div>
                        <div class="fw-mono fs-5">${customer.paymentId}</div>
                    </div>

                    <div class="fs-5 mb-4 p-2" style="color: #555;">
                        ${timingMsg}
                    </div>

                    <div class="text-start mb-4 bg-white p-3 rounded">
                        <h6 class="text-muted mb-3 text-uppercase small">Order Summary</h6>
                        ${itemsSummary}
                    </div>

                    <p class="small text-muted mb-4">
                        <i class="bi bi-envelope me-1"></i> Receipt sent to <strong>${customer.email}</strong>
                    </p>

                    <a href="${supportLink}" target="_blank" class="btn btn-success w-100 py-3 rounded-3 fw-bold">
                        <i class="bi bi-whatsapp me-2"></i> Chat with us on WhatsApp
                    </a>
                    
                    <div class="mt-3">
                        <a href="index.html" class="text-decoration-none text-muted small">Return to Home</a>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Hide mobile cart bar
    const mobileBar = document.getElementById('mobile-cart-bar');
    if (mobileBar) mobileBar.style.display = 'none';
}

// --- PDF & Email ---
function generateInvoicePDF(customer, items) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const subtotal = window.cart.getTotal();
    const fee = Math.round(subtotal * ONLINE_FEE_RATE * 100) / 100;
    const total = subtotal + deliveryCost + fee;

    // Header
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text("Shreeji Food & Snacks", 20, 20);
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text("Order Receipt", 20, 28);
    doc.setDrawColor(230, 168, 0);
    doc.setLineWidth(0.5);
    doc.line(20, 32, 190, 32);

    // Customer info
    let y = 40;
    doc.setFontSize(10);
    doc.text(`Customer: ${customer.name}`, 20, y); y += 6;
    doc.text(`Phone: ${customer.phone}`, 20, y); y += 6;
    if (customer.email) { doc.text(`Email: ${customer.email}`, 20, y); y += 6; }
    doc.text(`Order Type: ${customer.type}`, 20, y); y += 6;
    if (customer.address) { doc.text(`Address: ${customer.address}`, 20, y); y += 6; }
    doc.text(`Payment: ${customer.paymentId}`, 20, y); y += 10;

    // Items
    doc.setFont(undefined, 'bold');
    doc.text("Order Items:", 20, y); y += 7;
    doc.setFont(undefined, 'normal');
    items.forEach(item => {
        doc.text(`${item.day}: ${item.name} x${item.quantity} — £${(item.price * item.quantity).toFixed(2)}`, 25, y);
        y += 6;
    });

    // Totals
    y += 5;
    doc.line(20, y, 190, y); y += 7;
    doc.text(`Subtotal: £${subtotal.toFixed(2)}`, 20, y); y += 6;
    doc.text(`Delivery: £${deliveryCost.toFixed(2)}`, 20, y); y += 6;
    doc.text(`Service Fee (2%): £${fee.toFixed(2)}`, 20, y); y += 6;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.text(`Total: £${total.toFixed(2)}`, 20, y);

    return doc.output('blob');
}

async function sendOrderEmail(customer, items) {
    // 1. DEDUPLICATION CHECK
    if (sentOrderIds.has(customer.paymentId)) {
        console.warn(`Duplicate notification blocked for ID: ${customer.paymentId}`);
        return;
    }
    sentOrderIds.add(customer.paymentId);

    // Force verify emailjs presence
    if (typeof emailjs === 'undefined') {
        console.error("EmailJS not loaded! Order email skipped.");
        return;
    }

    const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const fee = Math.round(subtotal * ONLINE_FEE_RATE * 100) / 100;
    const total = subtotal + deliveryCost + fee;
    const itemsList = items.map(i => `${i.day}: ${i.name} x${i.quantity}`).join('\n');

    // 2. TRIGGER TELEGRAM (Single Call)
    try {
        await sendTelegramNotification(customer, items, customer.paymentId);
    } catch (e) {
        console.error("Telegram trigger failed", e);
    }

    // 3. PREPARE EMAIL CONTENT
    const message = `🚨 URGENT: NEW ORDER RECEIVED 🚨\n\n` +
        `Payment ID: ${customer.paymentId}\n\n` +
        `CUSTOMER DETAILS:\n` +
        `Name: ${customer.name}\n` +
        `Phone: ${customer.phone}\n` +
        `Email: ${customer.email}\n` +
        `Address: ${customer.address}\n\n` +
        `ORDER ITEMS:\n${itemsList}\n\n` +
        `Subtotal: £${subtotal.toFixed(2)}\nService Fee: £${fee.toFixed(2)}\nDelivery: £${deliveryCost.toFixed(2)}\nTotal: £${total.toFixed(2)}`;

    // Define standard params
    const baseParams = {
        name: customer.name,
        email: customer.email, // Some templates use {{email}} for body
        phone: customer.phone,
        message: message,      // The rich text body
        address: customer.address,
        subject: `NEW ORDER: ${customer.paymentId}`,
        email_subject: `NEW ORDER: ${customer.paymentId}`
    };

    // 4. SEND OWNER EMAIL (Simple)
    const ownerParams = {
        ...baseParams,
        to_name: "Shreeji Admin",
        reply_to: customer.email,
        cc: "" // No CC, just direct to owner (default)
    };

    // 5. SEND CUSTOMER EMAIL (Shotgun)
    const customerParams = {
        ...baseParams,
        to_name: customer.name,
        reply_to: "info@shreejifood.co.uk",
        to_email: customer.email,
        recipient: customer.email,
        // Removed CC here to avoid potential bounce/limit issues
    };

    console.log("Sending Owner Email...");
    emailjs.send("service_ejwyzx8", "template_djqwoxj", ownerParams)
        .then(() => console.log("Owner Email Sent"))
        .catch(e => console.error("Owner Email Failed", e));

    /*
    if (customer.email && customer.email.includes('@')) {
        console.log("Sending Customer Email (DISABLED: Fix Template First)");
        // emailjs.send("service_ejwyzx8", "template_djqwoxj", customerParams)
        //     .then(() => console.log("Customer Email Sent"))
        //     .catch(e => console.error("Customer Email Failed", e));
    }
    */
}


function showToast(msg) {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast show align-items-center border-0 shadow-lg mb-2';
    t.style.cssText = 'background: linear-gradient(135deg, #e6a800, #d49a00); color: #fff; border-radius: 12px; min-width: 280px; animation: slideDown 0.3s ease-out;';
    t.innerHTML = `<div class="d-flex align-items-center px-3 py-2">
        <span style="font-size: 1.2rem; margin-right: 8px;">✅</span>
        <div class="toast-body fw-semibold" style="font-size: 0.9rem;">${msg}</div>
    </div>`;
    box.appendChild(t);
    setTimeout(() => {
        t.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        t.style.opacity = '0';
        t.style.transform = 'translateY(-20px)';
        setTimeout(() => t.remove(), 400);
    }, 2200);
}

// --- Address Autocomplete (OpenStreetMap Nominatim) ---
(function initAddressAutocomplete() {
    const addressInput = document.getElementById('cust-address');
    const suggestionsEl = document.getElementById('address-suggestions');
    if (!addressInput || !suggestionsEl) return;

    let debounceTimer = null;
    let selectedIndex = -1;
    let lastResults = [];
    let justSelected = false; // prevents re-search after address selection

    // ARIA and input attributes for accessibility
    addressInput.setAttribute('autocomplete', 'off');
    addressInput.setAttribute('spellcheck', 'false');
    addressInput.setAttribute('aria-autocomplete', 'list');
    addressInput.setAttribute('aria-controls', 'address-suggestions');
    addressInput.setAttribute('role', 'combobox');
    addressInput.setAttribute('aria-expanded', 'false');
    suggestionsEl.setAttribute('role', 'listbox');

    // Build a clean, short address from Nominatim result
    function formatAddress(place) {
        const addr = place.address || {};
        const parts = [];

        // House number + road
        if (addr.house_number && addr.road) {
            parts.push(addr.house_number + ' ' + addr.road);
        } else if (addr.road) {
            parts.push(addr.road);
        } else if (addr.pedestrian) {
            parts.push(addr.pedestrian);
        }

        // Area
        const area = addr.suburb || addr.city || addr.town || addr.village || '';
        if (area) parts.push(area);

        // Postcode
        if (addr.postcode) parts.push(addr.postcode);

        return parts.length > 0 ? parts.join(', ') : place.display_name.split(',').slice(0, 3).join(',').trim();
    }

    addressInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const query = addressInput.value.trim();
        selectedIndex = -1;

        // Don't re-search if we just selected an address
        if (justSelected) {
            justSelected = false;
            return;
        }

        if (query.length < 3) {
            hideSuggestions();
            return;
        }

        // Show loading indicator
        suggestionsEl.innerHTML = `
            <li class="list-group-item text-center py-2" style="font-size: 0.85rem; color: #b89a40; border: none;">
                <span class="spinner-border spinner-border-sm me-1" style="width: 14px; height: 14px; color: #e6a800;"></span>
                Searching addresses...
            </li>
        `;
        suggestionsEl.style.display = 'block';
        addressInput.setAttribute('aria-expanded', 'true');

        debounceTimer = setTimeout(async () => {
            try {
                // Bias search towards the validated postcode outcode area
                // Extract outcode: "AL10 8DY" → "AL10"
                const outcode = validatedPostcode ? validatedPostcode.replace(/\s+/g, ' ').trim().split(' ')[0] : '';
                const locationHint = outcode || 'Hatfield';
                const searchQuery = query + ', ' + locationHint;
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=gb&viewbox=-0.35,51.85,-0.10,51.70&bounded=0&limit=5&addressdetails=1`;
                const res = await fetch(url, {
                    headers: { 'Accept-Language': 'en-GB' }
                });
                const results = await res.json();
                lastResults = results;

                suggestionsEl.innerHTML = '';

                if (results.length === 0) {
                    suggestionsEl.innerHTML = `
                        <li class="list-group-item text-center py-3" style="font-size: 0.85rem; border: none; color: #999;">
                            <div style="margin-bottom: 2px;">No addresses found</div>
                            <div style="font-size: 0.75rem; color: #bbb;">Try a postcode (e.g. AL10 9AB) or street name</div>
                        </li>
                    `;
                    suggestionsEl.style.display = 'block';
                    return;
                }

                // Header
                const header = document.createElement('li');
                header.className = 'list-group-item py-1 px-3';
                header.style.cssText = 'font-size: 0.68rem; color: #b89a40; text-transform: uppercase; letter-spacing: 0.6px; border: none; background: #fffdf5; font-weight: 700;';
                header.textContent = `${results.length} suggestion${results.length > 1 ? 's' : ''} found`;
                suggestionsEl.appendChild(header);

                results.forEach((place, index) => {
                    const li = document.createElement('li');
                    li.className = 'list-group-item list-group-item-action py-2 px-3';
                    li.setAttribute('role', 'option');
                    li.setAttribute('aria-selected', 'false');
                    li.dataset.index = index;

                    const addr = place.address || {};
                    const road = addr.road || addr.pedestrian || addr.neighbourhood || place.display_name.split(',')[0];
                    const houseNum = addr.house_number ? addr.house_number + ' ' : '';
                    const mainLine = houseNum + road;
                    const area = addr.suburb || addr.city || addr.town || addr.village || '';
                    const county = addr.county || '';
                    const postcode = addr.postcode || '';
                    const secondLine = [area, postcode].filter(Boolean).join(' · ');
                    const thirdLine = county && county !== area ? county : '';

                    li.innerHTML = `
                        <div style="cursor: pointer; display: flex; align-items: flex-start; gap: 10px;">
                            <span style="color: #e6a800; font-size: 1rem; margin-top: 2px; flex-shrink: 0;">📍</span>
                            <div style="min-width: 0; flex: 1;">
                                <div style="font-weight: 600; font-size: 0.9rem; color: #2c2c2c; line-height: 1.3;">
                                    ${mainLine}
                                </div>
                                ${secondLine ? `<div style="font-size: 0.78rem; color: #888; margin-top: 2px;">${secondLine}</div>` : ''}
                                ${thirdLine ? `<div style="font-size: 0.72rem; color: #bbb; margin-top: 1px;">${thirdLine}</div>` : ''}
                            </div>
                        </div>
                    `;

                    li.addEventListener('click', () => selectAddress(place));

                    li.addEventListener('mouseenter', () => {
                        clearHighlights();
                        li.style.background = '#fff8e8';
                        selectedIndex = index;
                    });

                    li.addEventListener('mouseleave', () => {
                        li.style.background = '';
                    });

                    suggestionsEl.appendChild(li);
                });

                suggestionsEl.style.display = 'block';
            } catch (err) {
                console.error('Address lookup failed:', err);
                suggestionsEl.innerHTML = `
                    <li class="list-group-item text-center py-2" style="font-size: 0.85rem; border: none; color: #999;">
                        Address lookup unavailable. Please type your full address.
                    </li>
                `;
            }
        }, 400);
    });

    function selectAddress(place) {
        // Format a clean, short address
        const cleanAddress = formatAddress(place);
        justSelected = true; // prevent re-search from the value change
        addressInput.value = cleanAddress;
        hideSuggestions();

        // Move cursor to start so user can verify the address
        addressInput.focus();
        addressInput.setSelectionRange(0, 0);

        // Auto-fill postcode if found and delivery is selected
        const addr = place.address || {};
        if (addr.postcode) {
            const postcodeInput = document.getElementById('delivery-postcode');
            if (postcodeInput) {
                postcodeInput.value = addr.postcode.toUpperCase();
                // Auto-trigger postcode validation
                if (typeof validatePostcode === 'function') {
                    validatePostcode();
                }
            }
        }
    }

    // Keyboard navigation
    addressInput.addEventListener('keydown', (e) => {
        const items = suggestionsEl.querySelectorAll('[role="option"]');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            highlightItem(items, selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            highlightItem(items, selectedIndex);
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            const place = lastResults[selectedIndex];
            if (place) selectAddress(place);
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    function highlightItem(items, index) {
        clearHighlights();
        if (items[index]) {
            items[index].style.background = '#fff8e8';
            items[index].setAttribute('aria-selected', 'true');
            items[index].scrollIntoView({ block: 'nearest' });
        }
    }

    function clearHighlights() {
        suggestionsEl.querySelectorAll('[role="option"]').forEach(li => {
            li.style.background = '';
            li.setAttribute('aria-selected', 'false');
        });
    }

    function hideSuggestions() {
        suggestionsEl.style.display = 'none';
        suggestionsEl.innerHTML = '';
        selectedIndex = -1;
        addressInput.setAttribute('aria-expanded', 'false');
    }

    // Hide suggestions when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!addressInput.contains(e.target) && !suggestionsEl.contains(e.target)) {
            hideSuggestions();
        }
    });

    // Re-trigger search on focus if there's text (but not right after selecting)
    addressInput.addEventListener('focus', () => {
        if (justSelected) return;
        if (addressInput.value.trim().length >= 3 && suggestionsEl.children.length === 0) {
            addressInput.dispatchEvent(new Event('input'));
        }
    });
})();

// --- Image Modal Logic ---
window.openMealImage = (element, day) => {
    const modal = document.getElementById("meal-image-modal");
    const modalImg = document.getElementById("img01");
    const captionText = document.getElementById("modal-caption");

    // Get background image URL
    const style = window.getComputedStyle(element);
    const bgImage = style.backgroundImage;

    // Extract URL from url("...")
    // Handles quotes or no quotes
    const urlMatch = bgImage.match(/url\(["']?([^"']*)["']?\)/);

    if (urlMatch && urlMatch[1]) {
        modal.style.display = "block";
        modalImg.src = urlMatch[1];
        captionText.innerHTML = `Scanning details for <strong>${day}'s Meal Set</strong>`;
    }
};

window.closeImageModal = () => {
    const modal = document.getElementById("meal-image-modal");
    if (modal) modal.style.display = "none";
};

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeImageModal();
});

init();

// --- TEST MODE: SIMULATE PAYMENT ---
if (window.location.search.includes('v=pay_test')) {
    console.warn("TEST MODE ACTIVATED: 'Simulate Payment' button enabled.");

    // Create the button
    const testBtn = document.createElement('button');
    testBtn.innerText = "🛠️ TEST: Simulate Payment (No Charge)";
    testBtn.className = "btn btn-warning w-100 mt-3 fw-bold";
    testBtn.style.border = "2px dashed #000";
    testBtn.id = "simulate-pay-btn";

    testBtn.onclick = async () => {
        const name = document.getElementById('cust-name').value;
        const email = document.getElementById('cust-email').value;
        const phone = document.getElementById('cust-phone').value;

        if (!name || !email || !phone) {
            alert("Please fill name/email/phone first.");
            return;
        }

        testBtn.innerText = "Processing Test...";
        testBtn.disabled = true;

        const customer = {
            name: name,
            email: email,
            phone: phone,
            address: document.getElementById('cust-address').value || 'Test Address',
            paymentId: 'TEST-' + Date.now(),
            type: currentOrderType
        };

        try {
            await sendOrderEmail(customer, window.cart.items);
            showOrderSuccess(customer, window.cart.items);
        } catch (e) {
            alert("Test Failed: " + e.message);
            testBtn.disabled = false;
        }
    };

    // Inject it into the checkout area once meaningful
    setInterval(() => {
        const payContainer = document.getElementById('paypal-button-container');
        if (payContainer && !document.getElementById('simulate-pay-btn')) {
            payContainer.parentNode.insertBefore(testBtn, payContainer);
        }
    }, 1000);
}

