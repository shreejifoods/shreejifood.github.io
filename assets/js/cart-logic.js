/**
 * Simple Shopping Cart Logic
 * - Add/Remove items
 * - Manage state in LocalStorage (for persistence)
 * - Calculate totals
 */
class ShoppingCart {
    constructor() {
        this.items = [];
        this.load();
    }

    add(item, day, quantity = 1) {
        // Check if existing item for same day
        const existing = this.items.find(i => i.id === item.id && i.day === day);
        if (existing) {
            existing.quantity += quantity;
        } else {
            this.items.push({
                ...item,
                day,
                quantity
            });
        }
        this.save();
    }

    remove(itemId, day) {
        this.items = this.items.filter(i => !(i.id === itemId && i.day === day));
        this.save();
    }

    updateQuantity(itemId, day, newQty) {
        const item = this.items.find(i => i.id === itemId && i.day === day);
        if (item) {
            item.quantity = Math.max(0, newQty);
            if (item.quantity === 0) this.remove(itemId, day);
        }
        this.save();
    }

    clear() {
        this.items = [];
        this.save();
    }

    getTotal() {
        return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }

    save() {
        localStorage.setItem('shreeji_cart', JSON.stringify(this.items));
        // Dispatch event for UI updates
        window.dispatchEvent(new Event('cart-updated'));
    }

    load() {
        const data = localStorage.getItem('shreeji_cart');
        if (data) {
            try {
                this.items = JSON.parse(data);
            } catch (e) {
                console.error("Failed to load cart", e);
                this.items = [];
            }
        }
    }
}

// Global instance
window.cart = new ShoppingCart();
