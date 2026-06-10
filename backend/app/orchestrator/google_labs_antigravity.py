import logging
import asyncio
from typing import Dict, Any, List, Callable
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("google_labs_antigravity")

import threading

class Node:
    def __init__(self, name: str, func: Callable, depends_on: List[str] = None):
        self.name = name
        self.func = func
        self.depends_on = depends_on or []
        self.lock = threading.Lock()

class AntigravityClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        logger.info("Antigravity SDK Client initialized.")

class AntigravityDAG:
    def __init__(self, name: str, client: AntigravityClient):
        self.name = name
        self.client = client
        self.nodes: Dict[str, Node] = {}
        self.results: Dict[str, Any] = {}

    def add_node(self, name: str, func: Callable, depends_on: List[str] = None):
        self.nodes[name] = Node(name, func, depends_on)

    def set_node_result(self, name: str, result: Any):
        """Pre-populate a node result if we are starting a segment mid-DAG."""
        self.results[name] = result

    def execute_node_sync(self, name: str, context: Dict[str, Any]) -> Any:
        node = self.nodes[name]
        with node.lock:
            if name in self.results:
                return self.results[name]

            # Resolve dependency results recursively
            dep_results = {}
            for dep in node.depends_on:
                dep_results[dep] = self.execute_node_sync(dep, context)

            logger.info(f"Antigravity Node [{name}] executing...")
            
            # Execute the wrapper function with error handling
            try:
                res = node.func(dep_results, context)
                self.results[name] = res
                logger.info(f"Antigravity Node [{name}] completed.")
                return res
            except Exception as exc:
                logger.error(f"Antigravity Node [{name}] failed: {exc}", exc_info=True)
                # Propagate error so pipeline can handle it
                raise

    def run_segment(self, target_nodes: List[str], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes the necessary nodes to resolve the target nodes.
        Supports parallel execution using ThreadPoolExecutor for parallel targets.
        """
        results = {}
        if len(target_nodes) > 1:
            with ThreadPoolExecutor() as executor:
                futures = {
                    name: executor.submit(self.execute_node_sync, name, context)
                    for name in target_nodes
                }
                for name, fut in futures.items():
                    try:
                        results[name] = fut.result()
                    except Exception as exc:
                        logger.error(f"Parallel Node [{name}] failed during execution: {exc}")
                        raise
        else:
            for name in target_nodes:
                results[name] = self.execute_node_sync(name, context)
                
        return results

def emit_trace_event(
    booking_id: str,
    agent: str,
    action: str,
    status: str,
    reasoning: str = "",
    data: dict = None
):
    """Bridge for telemetric structured events tracing."""
    event_str = (
        f"[ANTIGRAVITY TRACE] Booking: {booking_id} | "
        f"Agent: {agent} | Action: {action} | "
        f"Status: {status} | Reasoning: {reasoning}"
    )
    logger.info(event_str)
