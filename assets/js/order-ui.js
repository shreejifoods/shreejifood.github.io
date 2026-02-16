// Initialize EmailJS
(function () {
    // Check if EmailJS is available
    if (typeof emailjs !== 'undefined') {
        emailjs.init("byjrGBN3r1SvvFFhJ");
    } else {
        console.error("EmailJS script not loaded");
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
const btnPay = document.getElementById('btn-pay');

// State
let deliveryZones = [];
let currentOrderType = 'pickup';
let deliveryCost = 0;
let stripe = null;
let card = null;
let stripeMounted = false;

// --- Initialization ---
async function init() {
    try {
        // Init Stripe
        if (typeof Stripe !== 'undefined') {
            stripe = Stripe('pk_test_TYooMQauvdEDq54NiTphI7jx'); // Replaced with Test Key
        } else {
            console.error("Stripe.js not loaded");
        }

        const response = await fetch('assets/data/menu.json');
        const data = await response.json();

        deliveryZones = data.delivery_zones || [];
        populateDeliveryZones();
        renderMenu(data.menu);
        updateCartUI();

    } catch (e) {
        console.error("Failed to init", e);
        if (menuContainer) menuContainer.innerHTML = `<div class="alert alert-danger">Error loading menu. Please try refreshing.</div>`;
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
    // Keep this for when valid zone is set programmatically
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

    // Find zone
    let foundZone = null;
    let foundPrefix = '';

    // Check strict prefixes first
    for (const zone of deliveryZones) {
        if (zone.prefixes) {
            for (const prefix of zone.prefixes) {
                if (code.startsWith(prefix)) {
                    // Start match
                    foundZone = zone;
                    foundPrefix = prefix;
                    break;
                }
            }
        }
        if (foundZone) break;
    }

    if (foundZone) {
        // Success
        postcodeFeed.className = "small mb-2 fw-bold text-success";
        postcodeFeed.innerText = `Great! We deliver to ${foundZone.name}.`;

        // Select logic
        // We need to match option text or regenerate options? 
        // PopulateDeliveryZones handles values as Price.
        // But multiple zones might have same price.
        // We need to find the option that matches the NAME.

        let targetOptionIndex = 0;
        for (let i = 0; i < deliveryZoneSelect.options.length; i++) {
            if (deliveryZoneSelect.options[i].text.includes(foundZone.name)) {
                targetOptionIndex = i;
                break;
            }
        }

        deliveryZoneSelect.disabled = false;
        deliveryZoneSelect.selectedIndex = targetOptionIndex;
        // Trigger change
        deliveryCost = foundZone.price;
        updateCartUI();

        // Auto-fill address field if empty with postcode prefix
        const addrField = document.getElementById('cust-address');
        if (addrField && !addrField.value) {
            addrField.value = postcodeInput.value.toUpperCase();
        }

    } else {
        // Fail
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

// --- Render Menu (Strict Filter) ---
// --- Render Menu (Strict Filter) ---
function renderMenu(menuData) {
    if (!menuContainer) return;

    // STRICT FILTER: Only show what is in availableOrderDays
    const availableDays = window.MenuLogic.getAvailableOrderDays(new Date());

    // Sort logic to keep days in order Mon-Fri
    const dayOrder = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5 };
    availableDays.sort((a, b) => dayOrder[a] - dayOrder[b]);

    // Dynamic Grid Sizing
    let colClass = 'col-12 col-md-6 col-lg-4'; // Default 3 per row (Best for 3, 5, 6 items)

    // If exactly 4 items, 2x2 looks better and balanced.
    // If 2 items, 2 side-by-side matches.
    if (availableDays.length === 4 || availableDays.length === 2) {
        colClass = 'col-12 col-md-6';
    }

    let html = '';

    availableDays.forEach(day => {
        // Find existing data by day
        let item = null;
        Object.keys(menuData).forEach(key => {
            if (key === day) item = menuData[key];
        });

        const dayMenu = menuData[day];
        if (!dayMenu || !dayMenu.active) return;
        const mainItem = dayMenu.items[0]; // Assuming items is array of objects {id, name, price...}

        html += `
            <div class="${colClass} d-flex align-items-stretch">
                <div class="card w-100 shadow-sm border-0 meal-card mb-3" style="transition: transform 0.2s;">
                    <div class="card-body d-flex align-items-start gap-3 p-3">
                        <!-- Small square image thumbnail -->
                        <div class="day-meal-image ${day.toLowerCase()}-img"></div>

                        <!-- Content: title, items, button -->
                        <div class="flex-grow-1 d-flex flex-column">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="card-title fw-bold mb-0" style="font-family: 'Source Serif 4', serif; color: #3d2e00;">
                                    ${day}
                                </h6>
                                <span class="badge rounded-pill fw-semibold px-2 py-1" style="font-size: 0.8rem; background: #e6a800; color: #fff;">£${mainItem.price.toFixed(2)}</span>
                            </div>
                            <div class="meal-item-interactive mb-2" style="font-size: 0.85rem; color: #5a4a2a;">
                                <ul>
                                    ${mainItem.description.split(',').map(item => `<li>${item.trim()}</li>`).join('')}
                                </ul>
                            </div>
                            <button class="btn btn-sm mt-auto d-flex align-items-center justify-content-center py-1" 
                                style="background: #e6a800; color: #fff; border: none; border-radius: 8px; font-weight: 600;"
                                onmouseover="this.style.background='#d49a00'" onmouseout="this.style.background='#e6a800'"
                                onclick="addItemToCart('${mainItem.id}', '${mainItem.name}', ${mainItem.price}, '${day}')">
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
// --- Cart & Checkout Flow ---
function updateCartUI() {
    if (!cartContainer) return;

    const items = window.cart.items;
    const subtotal = window.cart.getTotal();
    const total = subtotal + deliveryCost;

    if (cartSubtotalEl) cartSubtotalEl.innerText = '£' + subtotal.toFixed(2);
    if (cartDeliveryEl) cartDeliveryEl.innerText = '£' + deliveryCost.toFixed(2);
    if (cartTotalEl) cartTotalEl.innerText = '£' + total.toFixed(2);

    const totalQty = items.reduce((a, b) => a + b.quantity, 0);
    if (cartCountBadge) cartCountBadge.innerText = totalQty;

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
                    <button class="btn btn-sm px-2 py-0" style="background: #e6a800; color: #fff; border: none; border-radius: 6px; font-weight: bold; font-size: 0.85rem;"
                        onclick="changeCartQty('${item.id}', '${item.day}', ${item.quantity - 1})" ${item.quantity <= 2 ? 'disabled style="background:#ccc;color:#fff;border:none;border-radius:6px;font-weight:bold;font-size:0.85rem;cursor:not-allowed;"' : ''}>−</button>
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

    // Validation: Min 2 items total (already satisfied if any item is added since we add 2)
    if (totalQty < 2) {
        btnShowCheckout.disabled = true;
        btnShowCheckout.innerText = "Minimum 2 portions required";
    } else if (currentOrderType === 'delivery' && deliveryCost === 0) {
        btnShowCheckout.disabled = false;
        btnShowCheckout.innerText = "Proceed to Checkout →";
    } else {
        btnShowCheckout.disabled = false;
        btnShowCheckout.innerText = "Proceed to Checkout →";
    }
}

// --- Cart Actions ---
window.addItemToCart = (id, name, price, day) => {
    // Check if already in cart for this day
    const existing = window.cart.items.find(i => i.id === id && i.day === day);
    if (existing) {
        // Already in cart, increment by 1
        window.cart.add({ id, name, price }, day, 1);
    } else {
        // New item — add with minimum 2 portions
        window.cart.add({ id, name, price }, day, 2);
    }
    updateCartUI();
    showToast(`Added to Order (min. 2 portions)`);
};

window.changeCartQty = (id, day, newQty) => {
    if (newQty < 2) {
        // Don't allow below 2 — user must delete entirely
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
        // focus
        deliveryZoneSelect.focus();
        return;
    }

    cartActionArea.style.display = 'none';
    checkoutSection.style.display = 'block';

    // Mount Stripe ONCE when visible
    if (!stripeMounted && stripe) {
        const elements = stripe.elements();
        card = elements.create('card');
        card.mount('#card-element');
        stripeMounted = true;
    }

    // Scroll to checkout
    checkoutSection.scrollIntoView({ behavior: 'smooth' });
});

// --- Final Checkout & Payment ---
checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!stripe || !card) {
        alert("Payment system not loaded.");
        return;
    }

    btnPay.disabled = true;
    btnPay.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Processing...';

    // 1. Create Payment Token
    const { token, error } = await stripe.createToken(card);

    if (error) {
        document.getElementById('card-errors').innerText = error.message;
        btnPay.disabled = false;
        btnPay.innerText = "Pay & Place Order";
        return;
    }

    // 2. Process Order
    const customer = {
        name: document.getElementById('cust-name').value,
        email: document.getElementById('cust-email').value,
        phone: document.getElementById('cust-phone').value,
        address: document.getElementById('cust-address').value,
        type: currentOrderType,
        range: currentOrderType === 'delivery' ? deliveryZoneSelect.options[deliveryZoneSelect.selectedIndex].text : '',
        paymentId: token.id
    };

    try {
        await sendOrderEmail(customer, window.cart.items);

        // PDF Simulation
        const pdfBlob = generateInvoicePDF(customer, window.cart.items);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(pdfBlob);
        link.download = `Invoice_${Date.now()}.pdf`;
        link.click();

        window.cart.clear(); // Clears cart

        // Success Message
        document.getElementById('menu-app').innerHTML = `
            <div class="container text-center py-5">
                <div class="card shadow border-0 p-5 d-inline-block">
                    <div class="mb-3 text-success display-1"><span class="mbri-success"></span></div>
                    <h2 class="mb-3">Order Placed Successfully!</h2>
                    <p class="text-muted">Thank you, ${customer.name}. Your payment was processed.</p>
                    <p class="text-muted">A receipt has been downloaded and emailed to you.</p>
                    <a href="index.html" class="btn btn-primary mt-3">Back to Home</a>
                </div>
            </div>
        `;

    } catch (err) {
        console.error(err);
        alert("Order error. Please contact us.");
        btnPay.disabled = false;
        btnPay.innerText = "Pay & Place Order";
    }
});

// ... PDF & Email generation (Simplified for brevity) ...
function generateInvoicePDF(customer, items) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Shreeji Food & Snacks", 20, 20);
    doc.setFontSize(12);
    doc.text("Receipt", 20, 30);
    doc.text(`Paid via Stripe: ${customer.paymentId}`, 20, 40);
    doc.text(`Total: £${(window.cart.getTotal() + deliveryCost).toFixed(2)}`, 20, 50);
    return doc.output('blob');
}

async function sendOrderEmail(customer, items) {
    if (typeof emailjs === 'undefined') return;

    const subtotal = window.cart.getTotal();
    const total = subtotal + deliveryCost;
    const itemsList = items.map(i => `${i.day}: ${i.name} x${i.quantity}`).join('\n');

    const message = `PAID Order (${customer.paymentId})\n${itemsList}\nTotal: £${total}`;

    const templateParams = {
        to_name: "Shreeji Admin",
        from_name: customer.name,
        from_email: customer.email,
        phone: customer.phone,
        address: customer.address,
        message: message
    };
    return emailjs.send("service_ejwyzx8", "template_djqwoxj", templateParams);
}

function showToast(msg) {
    const box = document.getElementById('toast-container');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast show align-items-center text-white bg-dark border-0 shadow mb-2';
    t.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div></div>`;
    box.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

init();
