#!/bin/bash

# Test script to run before pushing
# This validates the build and basic functionality

set -e  # Exit on any error

echo "=================================="
echo "Pre-Push Test Suite"
echo "=================================="
echo ""

# Test 1: Python package build
echo "1. Testing Python package build..."
pip install -e . --quiet
if [ $? -eq 0 ]; then
    echo "   ✅ Package build successful"
else
    echo "   ❌ Package build failed"
    exit 1
fi

# Test 2: Import test
echo "2. Testing imports..."
python -c "from src.ytmusic_server.server import create_server" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "   ✅ Server imports successfully"
else
    echo "   ❌ Import failed"
    exit 1
fi

# Test 3: Server creation test
echo "3. Testing server creation..."
python -c "
from src.ytmusic_server.server import create_server
server = create_server()
print('   ✅ Server created successfully')
" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "   ❌ Server creation failed"
    exit 1
fi

# Test 4: Header validation test
echo "4. Testing header validation..."
python test_auth_logic.py > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Header validation logic works"
else
    echo "   ❌ Header validation failed"
    exit 1
fi

# Test 5: Check for syntax errors
echo "5. Checking Python syntax..."
python -m py_compile src/ytmusic_server/server.py 2>/dev/null
if [ $? -eq 0 ]; then
    echo "   ✅ No syntax errors"
else
    echo "   ❌ Syntax errors found"
    exit 1
fi

echo ""
echo "=================================="
echo "✅ ALL TESTS PASSED - Safe to push!"
echo "=================================="
