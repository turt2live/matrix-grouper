# matrix-grouper

Organizes Synapse bridged users to groups.

# ⚠️ Use at your own risk ⚠️

This application is lightly tested, uses unstable APIs, and directly accesses the Synapse database. It is strongly recommended to not run this in a production environment without extensive testing and backups. **Use this application at your own risk.**

# Requirements

* A Synapse homeserver
* PostgreSQL as the database for Synapse
* NodeJS 6.11.0 or higher
* A bridge to group

# Usage

1. `git clone https://github.com/turt2live/matrix-grouper`
2. `cd matrix-grouper`
3. `npm install`
4. `node index.js -h`
