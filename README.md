# Smart Grid Optimization Platform

[![Discord](https://img.shields.io/badge/Discord-%235865F2.svg?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/BzDTGKtnru)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](#)
[![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)](#)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](#)

The AI Smart Grid Optimization platform is an advanced software solution designed to monitor, predict, and optimize electricity distribution in real-time. Built to simulate and manage industrial-scale power grids, this system provides grid operators with actionable intelligence to prevent overloads, balance distribution, and predict future demand using machine learning.

## Key Features

- ⚡ **Real-Time Monitoring**: Ingests and processes thousands of sensor readings per minute, tracking critical metrics such as power load, voltage, and grid frequency.
- 🔮 **AI Demand Forecasting**: Utilizes a pre-trained Long Short-Term Memory (LSTM) neural network to predict electricity demand 30 minutes into the future, adapting to continuous daily and seasonal cycles.
- 🚨 **Automated Anomaly Detection**: Instantly identifies grid irregularities such as voltage sags, abnormal frequency drops, or sudden load spikes.
- ⚖️ **Intelligent Load Balancing**: Automatically analyzes capacity across all monitored zones and generates actionable recommendations to shift loads from overloaded areas to those with spare capacity.
- 📊 **Interactive Dashboard**: A responsive, live-updating interface that visualizes grid health, upcoming demand forecasts, and critical alerts in an easy-to-read format.

![Smart Grid Dashboard](./docs/assets/dashboard_1.png)


## Documentation

For technical details, architectural diagrams, API references, and infrastructure setup instructions, please refer to the dedicated documentation directory.

**[View Full Technical Documentation](./docs/README.md)**

## Quick Start

The platform is fully containerized. To launch the entire system (including the simulator, backend, database, and frontend dashboard):

```bash
cd smart-grid
docker compose up --build
```

Once running, access the operator dashboard at `http://localhost:3000`.

## License
Proprietary software. Internal use only.
