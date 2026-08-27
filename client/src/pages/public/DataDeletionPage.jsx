import React from 'react';
import SEOHead from '../../components/layout/SEOHead';
import LegalLayout from '../../components/legal/LegalLayout';
import DataDeletionSteps from '../../components/legal/DataDeletionSteps';

/**
 * Standalone data deletion instructions.
 *
 * This is the URL to put in Meta App Dashboard -> Settings -> Basic ->
 * "Data Deletion Instructions URL". It must be publicly reachable without
 * logging in.
 */
const DataDeletionPage = () => (
    <LegalLayout
        eyebrow="Your data"
        title="Data Deletion Instructions"
        lede="This page explains what data we hold when you connect a Facebook or Instagram account, and how to have it deleted."
    >
        <SEOHead
            title="Data Deletion Instructions"
            description="How to delete the data Bitlance Tech Hub stores for your connected Facebook and Instagram accounts."
            canonicalUrl="https://www.bitlancetechhub.com/data-deletion"
        />
        <DataDeletionSteps />
    </LegalLayout>
);

export default DataDeletionPage;
