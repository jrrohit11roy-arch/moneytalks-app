---

# MoneyTalks Investment App

Create a modern mobile investment and trading application named **"MoneyTalks"** with an integrated AI assistant. The entire platform must be controlled through a secure Admin Panel. All user data, trading activity, asset prices, and transactions should be managed by the administrator and updated live for all users.

## User Registration & Login

Users must create an account before accessing the app.

Required registration fields:

* Full Name
* Mobile Number
* Address
* Pincode
* Username
* Password

After successful registration:

* The account is created and stored in the Admin Panel database.
* The administrator can view all user details.
* The administrator can see:

  * User profile information
  * Coin balance (CC)
  * RT9 shares owned
  * Platium holdings
  * Transaction history
  * Buy and sell activity

## Dashboard

After login, users will see:

1. Trading Section
2. Platium Investment Section
3. Wallet
4. Ask Coins
5. AI Assistant
6. Transaction History
7. Profile

---

## 1. Trading Section

The app contains only one tradable share:

### RT9

Features:

* Live price display
* Live chart
* Buy option
* Sell option
* User holdings display
* Profit/Loss calculation

Important:

* The RT9 price is completely controlled by the Admin Panel.
* When the admin changes the price, it updates live for all users instantly.
* Users can buy or sell RT9 at the current market price.

---

## 2. Platium Investment Section

The app contains a digital investment asset called:

### Platium

Features:

* Live price display
* Buy option
* Sell option
* Holdings display
* Profit/Loss calculation

Rules:

* Users can buy Platium using CC coins.
* Users can sell Platium at any time.
* Price changes are controlled by the Admin Panel.
* Live price updates must be visible to all users.

---

## 3. Wallet System

The app uses a virtual currency called:

### CC Coin

Rules:

* All buying and selling transactions use CC Coins.
* Users cannot directly deposit money.
* Users can only receive CC Coins through admin approval.

Wallet Features:

* Current CC balance
* Transaction history
* Coin request status

---

## 4. Ask Coins Feature

Users can request CC Coins.

Process:

1. User enters the number of CC Coins required.
2. Request is sent to the Admin Panel.
3. Admin can:

   * Approve Request
   * Reject Request
4. If approved, the requested CC Coins are added to the user's wallet automatically.

---

## 5. AI Assistant

Include an AI assistant that can:

* Explain trading concepts
* Explain investment concepts
* Show portfolio summaries
* Help users understand RT9 and Platium performance
* Answer user questions about the app

---

## 6. Admin Panel

Create a powerful Admin Dashboard with:

### User Management

* View all users
* Search users
* Suspend users
* Delete users
* View user portfolios

### Asset Management

* Change RT9 price
* Change Platium price
* Control live market movements
* View buy/sell transactions

### Coin Management

* Approve CC Coin requests
* Reject CC Coin requests
* Add or remove CC Coins manually

### Analytics

* Total users
* Total transactions
* Total RT9 holdings
* Total Platium holdings
* Total CC Coins in circulation

---

## Live System Requirements

* All prices must update live for every user.
* All transactions must update instantly.
* User portfolios must refresh automatically.
* Admin changes should be visible to all connected users in real time.

---

## Security

* Secure authentication system.
* Encrypted passwords.
* Role-based access control.
* Admin Panel accessible only to the administrator.

**Important Security Note:** Do **not** hard-code the admin password inside the app source code. Store it securely using environment variables or a secure authentication system.

---

## Design

* Modern professional investment app UI
* Dark and Light Mode
* Mobile-first design
* Fast and responsive
* Professional charts and portfolio screens

---

**Tech Requirement:** Build a complete production-ready app with frontend, backend, database, real-time updates, authentication, admin panel, wallet system, AI assistant integration, and cloud deployment support.
