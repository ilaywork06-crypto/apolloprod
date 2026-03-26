#!/bin/bash
set -e
echo "Building FundCompare Docker image..."
docker build -t fundcompare .
echo ""
echo "Done! Run with:"
echo "  docker run -p 8000:8000 fundcompare"
echo ""
echo "Then open: http://localhost:8000"
