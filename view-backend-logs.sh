#!/bin/bash
cd backend
echo "To view backend logs, you have two options:"
echo ""
echo "Option 1: Check the terminal where you started the server"
echo "Option 2: Restart the server in foreground:"
echo "  1. Stop current server: pkill -f 'node.*server.js'"
echo "  2. Start in foreground: cd backend && npm start"
echo ""
echo "Current server process:"
ps aux | grep "node.*server.js" | grep -v grep
