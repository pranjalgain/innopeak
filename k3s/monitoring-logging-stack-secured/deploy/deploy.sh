#!/bin/bash

## Mount the volume to /monitoring and also create required directories
# monitoring 'bash volume-mount.sh'

 # IP or hostname
MONITORING_NODE=$1
PRIV_KEY_PATH=$2

##Kubeconfig file
export KUBECONFIG=~/.kube/config

## 1. Mount the volume on the monitoring node
echo "Mounting volume on monitoring node..."
scp -i ${PRIV_KEY_PATH} -P 22 volume-mount.sh ubuntu@${MONITORING_NODE}:/tmp/volume-mount.sh
ssh ubuntu@${MONITORING_NODE} -p 22 -i ${PRIV_KEY_PATH} "bash /tmp/volume-mount.sh"

##Required taints and labels
kubectl taint nodes monitoring monitoring-only=true:NoSchedule
kubectl label node monitoring node-role=monitoring

## Install kube state metrics
bash kube-metrics-setup.sh

### 1. Create Namespace
kubectl apply -f ../namespace/ns.yml

## Switching to grafana directory
cd ../grafana/dashboards
bash create-dashboards.sh

## Switch back to root directory
cd ../..

##Install monitoring resources

# 2. Setup Storage
kubectl apply -f storage-class/expandable-local-storageclass.yml
kubectl apply -f pv/

# 3. Deploy Monitoring Components
kubectl apply -f node-exporter/
kubectl apply -f blackbox-exporter/
kubectl apply -f alert-manager/
kubectl apply -f prometheus/

# 4. Deploy Logging Components
kubectl apply -f loki/
kubectl apply -f promtail/

# 5. Deploy Grafana
kubectl apply -f grafana/pvc.yml
kubectl apply -f grafana/datasources/
kubectl apply -f grafana/dashboards/global-dashboard-definition.yml
kubectl apply -f grafana/manifest.yml